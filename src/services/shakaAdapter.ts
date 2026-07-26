/* eslint-disable @typescript-eslint/no-explicit-any */
// Bridges googlevideo's SABR streaming adapter to shaka-player.
//
// Ported from googlevideo's sabr-shaka-example. Two deliberate differences:
//
//  - The reference proxies requests through the `ytc-bridge` browser extension
//    to escape CORS. We use `tauriFetch`, which goes through Rust and has no
//    such restriction, so the extension check is dropped entirely.
//  - Only the pieces NeoTube needs are kept; DRM handling is omitted since we
//    never play protected content.

import shaka from 'shaka-player/dist/shaka-player.ui'
import { FormatKeyUtils, isGoogleVideoURL } from 'googlevideo/utils'
import type { CacheManager, RequestMetadataManager } from 'googlevideo/utils'
import type { SabrFormat } from 'googlevideo/shared-types'
import {
  SabrUmpProcessor,
  type RequestFilter,
  type ResponseFilter,
  type SabrPlayerAdapter,
  type SabrRequestMetadata,
  type UmpProcessingResult,
} from 'googlevideo/sabr-streaming-adapter'
import { tauriFetch } from '../utils/tauri'

function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => { result[key.trim()] = value })
  return result
}

function recoverableError(message: string, info?: Record<string, any>) {
  return new shaka.util.Error(
    shaka.util.Error.Severity.RECOVERABLE,
    shaka.util.Error.Category.NETWORK,
    shaka.util.Error.Code.HTTP_ERROR,
    message,
    { info },
  )
}

function makeResponse(
  headers: Record<string, string>,
  data: BufferSource,
  status: number,
  uri: string,
  responseURL: string,
  request: shaka.extern.Request,
  requestType: shaka.net.NetworkingEngine.RequestType,
): shaka.extern.Response & { originalRequest: shaka.extern.Request } {
  if (status >= 200 && status <= 299 && status !== 202) {
    return {
      uri: responseURL || uri,
      originalUri: uri,
      data,
      status,
      headers,
      originalRequest: request,
      fromCache: !!headers['x-shaka-from-cache'],
    } as shaka.extern.Response & { originalRequest: shaka.extern.Request }
  }

  let responseText: string | null = null
  try { responseText = shaka.util.StringUtils.fromBytesAutoDetect(data) } catch { /* binary */ }

  // 401/403 will not improve on retry; anything else might.
  const severity = status === 401 || status === 403
    ? shaka.util.Error.Severity.CRITICAL
    : shaka.util.Error.Severity.RECOVERABLE

  throw new shaka.util.Error(
    severity,
    shaka.util.Error.Category.NETWORK,
    shaka.util.Error.Code.BAD_HTTP_STATUS,
    uri, status, responseText, headers, requestType, responseURL || uri,
  )
}

export class ShakaPlayerAdapter implements SabrPlayerAdapter {
  protected player: shaka.Player | null = null
  private requestMetadataManager?: RequestMetadataManager
  private cacheManager?: CacheManager
  private abortController?: AbortController
  private requestFilter?: Parameters<shaka.net.NetworkingEngine['registerRequestFilter']>[0]
  private responseFilter?: Parameters<shaka.net.NetworkingEngine['registerResponseFilter']>[0]

  initialize(
    player: shaka.Player,
    requestMetadataManager: RequestMetadataManager,
    cacheManager: CacheManager,
  ): void {
    this.player = player
    this.requestMetadataManager = requestMetadataManager
    this.cacheManager = cacheManager

    // Take over http(s) so SABR's UMP responses can be decoded before shaka
    // sees them.
    for (const scheme of ['http', 'https']) {
      shaka.net.NetworkingEngine.registerScheme(
        scheme,
        this.parseRequest.bind(this),
        shaka.net.NetworkingEngine.PluginPriority.PREFERRED,
      )
    }
  }

  private parseRequest(
    uri: string,
    request: shaka.extern.Request,
    requestType: shaka.net.NetworkingEngine.RequestType,
    progressUpdated: shaka.extern.ProgressUpdated,
    headersReceived: shaka.extern.HeadersReceived,
    config: shaka.extern.SchemePluginConfig,
  ): shaka.extern.IAbortableOperation<shaka.extern.Response> {
    const headers = new Headers()
    for (const [key, value] of Object.entries(request.headers ?? {})) {
      headers.append(key, value as string)
    }

    const controller = new AbortController()
    this.abortController = controller

    const init: RequestInit = {
      body: (request.body as any) || undefined,
      headers,
      method: request.method,
      signal: controller.signal,
    }

    const abortStatus = { canceled: false, timedOut: false }
    const pending = this.request(
      uri, request, requestType, init, controller, abortStatus,
      progressUpdated, headersReceived, config.minBytesForProgressEvents || 0,
    )

    const operation = new shaka.util.AbortableOperation(pending, () => {
      abortStatus.canceled = true
      controller.abort()
      return Promise.resolve()
    })

    const timeoutMs = request.retryParameters?.timeout
    if (timeoutMs) {
      const timer = new shaka.util.Timer(() => {
        abortStatus.timedOut = true
        controller.abort()
      })
      timer.tickAfter(timeoutMs / 1000)
      operation.finally(() => timer.stop())
    }

    return operation
  }

  /** Serves a segment from googlevideo's cache when it has one. */
  private async handleCachedRequest(
    metadata: SabrRequestMetadata,
    uri: string,
    request: shaka.extern.Request,
    progressUpdated: shaka.extern.ProgressUpdated,
    headersReceived: shaka.extern.HeadersReceived,
    requestType: shaka.net.NetworkingEngine.RequestType,
  ): Promise<shaka.extern.Response | null> {
    if (!metadata.byteRange || !this.cacheManager) return null

    const key = FormatKeyUtils.createSegmentCacheKeyFromMetadata(metadata)
    let buffer = (metadata.isInit
      ? this.cacheManager.getInitSegment(key)
      : this.cacheManager.getSegment(key))?.buffer as ArrayBuffer | undefined
    if (!buffer) return null

    if (metadata.isInit) {
      buffer = buffer.slice(metadata.byteRange.start, metadata.byteRange.end + 1)
    }

    const headers = {
      'content-type': metadata.format?.mimeType?.split(';')[0] || '',
      'content-length': String(buffer.byteLength),
      'x-shaka-from-cache': 'true',
    }
    headersReceived(headers)
    progressUpdated(0, buffer.byteLength, 0)
    return makeResponse(headers, buffer, 200, uri, uri, request, requestType)
  }

  /** Decodes a UMP-framed SABR response into a plain media segment. */
  private async handleUmpResponse(
    response: Response,
    metadata: SabrRequestMetadata,
    uri: string,
    request: shaka.extern.Request,
    requestType: shaka.net.NetworkingEngine.RequestType,
    progressUpdated: shaka.extern.ProgressUpdated,
    abortController: AbortController,
    minBytes: number,
  ): Promise<shaka.extern.Response> {
    let lastTime = Date.now()
    const reader = new SabrUmpProcessor(metadata, this.cacheManager)

    const checkIntegrity = (result: UmpProcessingResult) => {
      const protectionFailed = metadata.streamInfo?.streamProtectionStatus?.status === 3
      if (!result.data && (!!metadata.error || protectionFailed) && !metadata.streamInfo?.sabrContextUpdate) {
        throw recoverableError('Server streaming error', metadata as any)
      }
    }

    // A redirect or context update legitimately carries no media.
    const emptyIsExpected = () =>
      metadata.isSABR && (metadata.streamInfo?.redirect || metadata.streamInfo?.sabrContextUpdate)

    if (!response.body) {
      const buffer = await response.arrayBuffer()
      progressUpdated(Date.now() - lastTime, buffer.byteLength, 0)

      const result = await reader.processChunk(new Uint8Array(buffer))
      if (result) {
        checkIntegrity(result)
        return this.toShakaResponse(uri, request, requestType, response, result.data)
      }
      if (emptyIsExpected()) {
        return this.toShakaResponse(uri, request, requestType, response, undefined)
      }
      throw recoverableError('Empty response with no redirect information', metadata as any)
    }

    const bodyReader = response.body.getReader()
    let loaded = 0
    let lastLoaded = 0
    let contentLength: string | undefined

    while (!abortController.signal.aborted) {
      let chunk
      try { chunk = await bodyReader.read() } catch { break }

      if (chunk.done) {
        if (emptyIsExpected()) {
          return this.toShakaResponse(uri, request, requestType, response, undefined)
        }
        throw recoverableError('Empty response with no redirect information', metadata as any)
      }

      const result = await reader.processChunk(chunk.value)
      const segmentInfo = reader.getSegmentInfo()

      if (segmentInfo) {
        contentLength ??= segmentInfo.mediaHeader.contentLength
        loaded += segmentInfo.lastChunkSize || 0
        segmentInfo.lastChunkSize = 0
      }

      const now = Date.now()
      const chunkSize = loaded - lastLoaded
      if ((now - lastTime > 100 && chunkSize >= minBytes) || result) {
        if (result) checkIntegrity(result)
        if (contentLength) {
          const remaining = result ? 0 : parseInt(contentLength) - loaded
          try { progressUpdated(now - lastTime, chunkSize, remaining) } catch { /* no-op */ }
          lastLoaded = loaded
          lastTime = now
        }
      }

      if (result) {
        abortController.abort()
        return this.toShakaResponse(uri, request, requestType, response, result.data)
      }
    }

    throw recoverableError('UMP stream processing was aborted before producing a result', metadata as any)
  }

  private async request(
    uri: string,
    request: shaka.extern.Request,
    requestType: shaka.net.NetworkingEngine.RequestType,
    init: RequestInit,
    abortController: AbortController,
    abortStatus: { canceled: boolean; timedOut: boolean },
    progressUpdated: shaka.extern.ProgressUpdated,
    headersReceived: shaka.extern.HeadersReceived,
    minBytes: number,
  ): Promise<shaka.extern.Response> {
    try {
      const metadata = this.requestMetadataManager?.getRequestMetadata(uri)

      if (metadata) {
        const cached = await this.handleCachedRequest(
          metadata, uri, request, progressUpdated, headersReceived, requestType,
        )
        if (cached) return cached
      }

      // Everything goes through Rust; the webview's CORS rules never apply.
      const response = await tauriFetch(uri, init)
      headersReceived(headersToObject(response.headers))

      const isUmp = response.headers.get('content-type') === 'application/vnd.yt-ump'
      if (metadata && init.method !== 'HEAD' && isUmp) {
        return this.handleUmpResponse(
          response, metadata, uri, request, requestType,
          progressUpdated, abortController, minBytes,
        )
      }

      const start = Date.now()
      const buffer = await response.arrayBuffer()
      progressUpdated(Date.now() - start, buffer.byteLength, 0)
      return this.toShakaResponse(uri, request, requestType, response, buffer)
    } catch (error) {
      if (abortStatus.canceled) {
        throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.OPERATION_ABORTED, uri, requestType,
        )
      }
      if (abortStatus.timedOut) {
        throw new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.TIMEOUT, uri, requestType,
        )
      }
      throw new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.HTTP_ERROR, uri, error, requestType,
      )
    }
  }

  private toShakaResponse(
    uri: string,
    request: shaka.extern.Request,
    requestType: shaka.net.NetworkingEngine.RequestType,
    response: Response,
    // Accepts googlevideo's Uint8Array as well as a plain buffer.
    data?: BufferSource | Uint8Array<ArrayBufferLike>,
  ): shaka.extern.Response {
    return makeResponse(
      headersToObject(response.headers),
      (data as BufferSource) ?? new ArrayBuffer(0),
      response.status,
      uri,
      response.url,
      request,
      requestType,
    )
  }

  private assertPlayer(): asserts this is { player: shaka.Player } & this {
    if (!this.player) throw new Error('Player not initialized')
  }

  getPlayerTime(): number {
    this.assertPlayer()
    return this.player.getMediaElement()?.currentTime || 0
  }

  getPlaybackRate(): number {
    this.assertPlayer()
    return this.player.getPlaybackRate()
  }

  getBandwidthEstimate(): number {
    this.assertPlayer()
    return this.player.getStats().estimatedBandwidth
  }

  getActiveTrackFormats(activeFormat: SabrFormat, sabrFormats: SabrFormat[]): {
    videoFormat?: SabrFormat
    audioFormat?: SabrFormat
  } {
    this.assertPlayer()
    const activeId = FormatKeyUtils.getUniqueFormatId(activeFormat)
    const variant = this.player.getVariantTracks().find(track =>
      activeId === (activeFormat.width ? track.originalVideoId : track.originalAudioId),
    )
    if (!variant) return {}

    const byId = new Map(sabrFormats.map(f => [FormatKeyUtils.getUniqueFormatId(f), f]))
    return {
      videoFormat: variant.originalVideoId ? byId.get(variant.originalVideoId) : undefined,
      audioFormat: variant.originalAudioId ? byId.get(variant.originalAudioId) : undefined,
    }
  }

  registerRequestInterceptor(interceptor: RequestFilter): void {
    this.assertPlayer()
    const engine = this.player.getNetworkingEngine()
    if (!engine) return

    this.requestFilter = async (type: any, request: any, context: any) => {
      if (type !== shaka.net.NetworkingEngine.RequestType.SEGMENT) return
      if (!isGoogleVideoURL(request.uris[0])) return

      const modified = await interceptor({
        headers: request.headers,
        url: request.uris[0],
        method: request.method,
        segment: {
          getStartTime: () => context?.segment?.getStartTime() ?? null,
          isInit: () => !context?.segment,
        },
        body: request.body,
      })

      if (modified) {
        request.uris = modified.url ? [modified.url] : request.uris
        request.method = modified.method || request.method
        request.headers = modified.headers || request.headers
        request.body = modified.body || request.body
      }
    }
    engine.registerRequestFilter(this.requestFilter)
  }

  registerResponseInterceptor(interceptor: ResponseFilter): void {
    this.assertPlayer()
    const engine = this.player.getNetworkingEngine()
    if (!engine) return

    this.responseFilter = async (type: any, response: any, context: any) => {
      if (type !== shaka.net.NetworkingEngine.RequestType.SEGMENT) return
      if (!isGoogleVideoURL(response.uri)) return

      const modified = await interceptor({
        url: response.originalRequest.uris[0],
        method: response.originalRequest.method,
        headers: response.headers,
        data: response.data,
        makeRequest: async (url: string, headers: Record<string, string>) => {
          const retry = this.player!.getConfiguration().streaming.retryParameters
          const redirect = shaka.net.NetworkingEngine.makeRequest([url], retry)
          Object.assign(redirect.headers, headers)
          const result = await engine.request(type, redirect, context).promise
          return {
            url: result.uri,
            method: (result as any).originalRequest.method,
            headers: result.headers,
            data: result.data,
          }
        },
      })

      if (modified) {
        response.data = modified.data ?? response.data
        Object.assign(response.headers, modified.headers)
      }
    }
    engine.registerResponseFilter(this.responseFilter)
  }

  dispose(): void {
    this.abortController?.abort()
    this.abortController = undefined

    if (this.player) {
      const engine = this.player.getNetworkingEngine()
      if (engine && this.requestFilter && this.responseFilter) {
        engine.unregisterRequestFilter(this.requestFilter)
        engine.unregisterResponseFilter(this.responseFilter)
      }
      shaka.net.NetworkingEngine.unregisterScheme('http')
      shaka.net.NetworkingEngine.unregisterScheme('https')
      this.player = null
    }
  }
}
