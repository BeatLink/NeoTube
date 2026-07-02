import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/models.dart';

// Raised when the server returns a non-2xx status.
class ApiException implements Exception {
  final int statusCode;
  final String message;
  const ApiException(this.statusCode, this.message);
  @override
  String toString() => 'ApiException($statusCode): $message';
}

class NeoTubeClient {
  final String baseUrl;

  NeoTubeClient(this.baseUrl);

  // ── Helpers ────────────────────────────────────────────────────────────────

  Uri _uri(String path, [Map<String, String?>? params]) {
    final base = Uri.parse('$baseUrl$path');
    if (params == null) return base;
    final clean = {
      for (final e in params.entries)
        if (e.value != null) e.key: e.value!,
    };
    return base.replace(queryParameters: clean.isEmpty ? null : clean);
  }

  Future<dynamic> _get(String path, [Map<String, String?>? params]) async {
    final res = await http.get(_uri(path, params));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(res.statusCode, res.body);
    }
    return jsonDecode(res.body);
  }

  Future<dynamic> _post(String path, Map<String, dynamic> body) async {
    final res = await http.post(
      _uri(path),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(res.statusCode, res.body);
    }
    if (res.statusCode == 204 || res.body.isEmpty) return null;
    return jsonDecode(res.body);
  }

  Future<void> _delete(String path) async {
    final res = await http.delete(_uri(path));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(res.statusCode, res.body);
    }
  }

  Future<void> _patch(String path, Map<String, dynamic> body) async {
    final res = await http.patch(
      _uri(path),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(res.statusCode, res.body);
    }
  }

  // ── Health ────────────────────────────────────────────────────────────────

  Future<bool> ping() async {
    try {
      final j = await _get('/api/health') as Map<String, dynamic>;
      return j['ok'] == true;
    } catch (_) {
      return false;
    }
  }

  // ── Video / Search ────────────────────────────────────────────────────────

  Future<List<SearchResult>> search(String query,
      {int limit = 20, String? backend}) async {
    final j = await _get('/api/search', {
      'q': query,
      'limit': '$limit',
      'backend': backend,
    }) as List<dynamic>;
    return j.map((e) => SearchResult.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<VideoInfo> getVideo(String id, {String? backend}) async {
    final j = await _get('/api/video/$id', {'backend': backend})
        as Map<String, dynamic>;
    return VideoInfo.fromJson(j);
  }

  // ── Channel ───────────────────────────────────────────────────────────────

  Future<ChannelInfo> getChannel(String id, {String? backend}) async {
    final j = await _get('/api/channel/$id', {'backend': backend})
        as Map<String, dynamic>;
    return ChannelInfo.fromJson(j);
  }

  Future<List<ChannelVideo>> getChannelVideos(String id,
      {int limit = 30, String? backend}) async {
    final j = await _get('/api/channel/$id/videos', {
      'limit': '$limit',
      'backend': backend,
    }) as List<dynamic>;
    return j.map((e) => ChannelVideo.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<ChannelPlaylist>> getChannelPlaylists(String id,
      {String? backend}) async {
    final j = await _get('/api/channel/$id/playlists', {'backend': backend})
        as List<dynamic>;
    return j
        .map((e) => ChannelPlaylist.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  Future<List<Subscription>> getSubscriptions() async {
    final j = await _get('/api/subscriptions') as List<dynamic>;
    return j.map((e) => Subscription.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<bool> isSubscribed(String channelId) async {
    final j = await _get('/api/subscriptions/$channelId/status')
        as Map<String, dynamic>;
    return j['subscribed'] as bool? ?? false;
  }

  Future<void> subscribe(String channelId, String name,
      {String? thumbnail}) async {
    await _post('/api/subscriptions', {
      'channelId': channelId,
      'name': name,
      if (thumbnail != null) 'thumbnail': thumbnail,
    });
  }

  Future<void> unsubscribe(String channelId) async {
    await _delete('/api/subscriptions/$channelId');
  }

  // ── History ───────────────────────────────────────────────────────────────

  Future<List<HistoryEntry>> getHistory() async {
    final j = await _get('/api/history') as List<dynamic>;
    return j.map((e) => HistoryEntry.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> recordWatch({
    required String videoId,
    required String title,
    required String channelId,
    required String channelName,
    String? thumbnail,
    int? duration,
  }) async {
    await _post('/api/history', {
      'videoId': videoId,
      'title': title,
      'channelId': channelId,
      'channelName': channelName,
      if (thumbnail != null) 'thumbnail': thumbnail,
      if (duration != null) 'duration': duration,
    });
  }

  Future<void> removeFromHistory(String videoId) async {
    await _delete('/api/history/$videoId');
  }

  Future<void> clearHistory() async {
    await _delete('/api/history');
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  Future<UserSettings> getSettings() async {
    final j = await _get('/api/settings') as Map<String, dynamic>;
    return UserSettings.fromJson(j);
  }

  Future<void> patchSettings(Map<String, dynamic> patch) async {
    await _patch('/api/settings', patch);
  }

  // ── Image proxy ───────────────────────────────────────────────────────────

  // Returns a URL that the server will proxy — avoids CORS on mobile.
  String proxyImage(String? originalUrl) {
    if (originalUrl == null || originalUrl.isEmpty) return '';
    return '$baseUrl/api/proxy?url=${Uri.encodeComponent(originalUrl)}';
  }
}
