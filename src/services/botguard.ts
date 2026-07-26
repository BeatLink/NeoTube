// BotGuard / WebPO token minting.
//
// SABR segment requests carry a "proof of origin" token. Minting one means
// running YouTube's own BotGuard interpreter — a script fetched at runtime and
// evaluated in the page — then exchanging its snapshot for an integrity token.
//
// Ported from googlevideo's sabr-shaka-example. The reference implementation
// routes these calls through a browser extension to dodge CORS; we use the
// Tauri HTTP shim instead, which has no such restriction.

import { BG, buildURL, GOOG_API_KEY } from 'bgutils-js'
import type { DescrambledChallenge, WebPoSignalOutput } from 'bgutils-js'
import { tauriFetch } from '../utils/tauri'

/** Identifies this client to the BotGuard service. From the reference impl. */
const WAA_REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo'

const JSON_PROTOBUF_HEADERS = {
  'content-type': 'application/json+protobuf',
  'x-goog-api-key': GOOG_API_KEY,
  'x-user-agent': 'grpc-web-javascript/0.1',
}

export class BotguardService {
  private client?: BG.BotGuardClient
  private minter?: BG.WebPoMinter
  private challenge?: DescrambledChallenge
  private pending: Promise<BG.BotGuardClient | undefined> | null = null

  /** True once a real (non cold-start) token can be minted. */
  isInitialized(): boolean {
    return !!this.client && !!this.minter
  }

  async init(): Promise<BG.BotGuardClient | undefined> {
    if (this.pending) return this.pending
    this.pending = this.setup()
    try {
      this.client = await this.pending
      return this.client
    } finally {
      this.pending = null
    }
  }

  async reinit(): Promise<BG.BotGuardClient | undefined> {
    if (this.pending) return this.pending
    this.dispose()
    return this.init()
  }

  private async setup(): Promise<BG.BotGuardClient | undefined> {
    const response = await tauriFetch(buildURL('Create', true), {
      method: 'POST',
      headers: JSON_PROTOBUF_HEADERS,
      body: JSON.stringify([WAA_REQUEST_KEY]),
    })

    this.challenge = BG.Challenge.parseChallengeData(await response.json())
    if (!this.challenge) return undefined

    const interpreter =
      this.challenge.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue
    if (!interpreter) return undefined

    // The interpreter has to be evaluated in the page for BotGuard to find its
    // global; this is why the CSP allows 'unsafe-eval'.
    if (!document.getElementById(this.challenge.interpreterHash)) {
      const script = document.createElement('script')
      script.type = 'text/javascript'
      script.id = this.challenge.interpreterHash
      script.textContent = interpreter
      document.head.appendChild(script)
    }

    this.client = await BG.BotGuardClient.create({
      globalObj: globalThis,
      globalName: this.challenge.globalName,
      program: this.challenge.program,
    })

    const webPoSignalOutput: WebPoSignalOutput = []
    const snapshot = await this.client.snapshot({ webPoSignalOutput })

    const tokenResponse = await tauriFetch(buildURL('GenerateIT', true), {
      method: 'POST',
      headers: JSON_PROTOBUF_HEADERS,
      body: JSON.stringify([WAA_REQUEST_KEY, snapshot]),
    })

    const integrityToken = (await tokenResponse.json())[0] as string | undefined
    if (!integrityToken) return undefined

    this.minter = await BG.WebPoMinter.create({ integrityToken }, webPoSignalOutput)
    return this.client
  }

  /**
   * A token usable before BotGuard has finished initialising. Weaker than a
   * minted one, but lets the first segments start loading immediately.
   */
  mintColdStartToken(contentBinding: string): string {
    return BG.PoToken.generateColdStartToken(contentBinding)
  }

  async mint(contentBinding: string): Promise<string | undefined> {
    if (!this.isInitialized()) await this.reinit()
    if (!this.minter) return undefined
    return this.minter.mintAsWebsafeString(decodeURIComponent(contentBinding))
  }

  dispose(): void {
    if (this.client && this.challenge) {
      this.client.shutdown()
      document.getElementById(this.challenge.interpreterHash)?.remove()
    }
    this.client = undefined
    this.minter = undefined
    this.challenge = undefined
  }
}

export const botguardService = new BotguardService()
