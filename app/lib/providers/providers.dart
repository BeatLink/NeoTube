import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api/client.dart';

// ── Server URL ────────────────────────────────────────────────────────────────

const _kServerUrlKey = 'serverUrl';
const _kDefaultUrl = 'http://localhost:7700';

final sharedPrefsProvider = FutureProvider<SharedPreferences>(
    (_) => SharedPreferences.getInstance());

final serverUrlProvider =
    StateNotifierProvider<ServerUrlNotifier, String>((ref) {
  final prefs = ref.watch(sharedPrefsProvider).valueOrNull;
  return ServerUrlNotifier(prefs);
});

class ServerUrlNotifier extends StateNotifier<String> {
  final SharedPreferences? _prefs;

  ServerUrlNotifier(this._prefs)
      : super(_prefs?.getString(_kServerUrlKey) ?? _kDefaultUrl);

  Future<void> setUrl(String url) async {
    state = url.trimRight().replaceAll(RegExp(r'/$'), '');
    await _prefs?.setString(_kServerUrlKey, state);
  }
}

// ── API client ────────────────────────────────────────────────────────────────

final apiClientProvider = Provider<NeoTubeClient>((ref) {
  final url = ref.watch(serverUrlProvider);
  return NeoTubeClient(url);
});

// ── Remote data ───────────────────────────────────────────────────────────────

final settingsProvider = FutureProvider((ref) {
  final client = ref.watch(apiClientProvider);
  return client.getSettings();
});

final subscriptionsProvider = FutureProvider((ref) {
  final client = ref.watch(apiClientProvider);
  return client.getSubscriptions();
});

final historyProvider = FutureProvider((ref) {
  final client = ref.watch(apiClientProvider);
  return client.getHistory();
});
