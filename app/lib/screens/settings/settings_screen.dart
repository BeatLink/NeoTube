import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/providers.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _urlCtrl = TextEditingController();
  final _cookieCtrl = TextEditingController();
  bool _cookieObscured = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _urlCtrl.text = ref.read(serverUrlProvider);
  }

  @override
  void dispose() {
    _urlCtrl.dispose();
    _cookieCtrl.dispose();
    super.dispose();
  }

  Future<void> _saveUrl() async {
    final url = _urlCtrl.text.trim();
    if (url.isEmpty) return;
    await ref.read(serverUrlProvider.notifier).setUrl(url);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Server URL saved.')));
    }
  }

  Future<void> _saveCookie() async {
    final cookie = _cookieCtrl.text.trim();
    setState(() => _saving = true);
    try {
      await ref.read(apiClientProvider).patchSettings({'ytCookie': cookie});
      _cookieCtrl.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Cookie saved.')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _clearCookie() async {
    setState(() => _saving = true);
    try {
      await ref.read(apiClientProvider).patchSettings({'ytCookie': ''});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Cookie cleared.')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final serverUrl = ref.watch(serverUrlProvider);
    final settingsAsync = ref.watch(settingsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Server URL ────────────────────────────────────────────────
          Text('Server', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _urlCtrl,
                decoration: const InputDecoration(
                  labelText: 'Server URL',
                  hintText: 'http://192.168.1.10:7700',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.url,
                onSubmitted: (_) => _saveUrl(),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(onPressed: _saveUrl, child: const Text('Save')),
          ]),
          const SizedBox(height: 6),
          Text('Current: $serverUrl',
              style: Theme.of(context).textTheme.bodySmall),
          const Divider(height: 32),

          // ── YouTube cookie ────────────────────────────────────────────
          Text('YouTube Authentication',
              style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          settingsAsync.when(
            loading: () => const CircularProgressIndicator(),
            error: (e, _) =>
                Text('Could not load server settings: $e'),
            data: (s) => s.ytCookie != null && s.ytCookie!.isNotEmpty
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Cookie is set on server.'),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: _saving ? null : _clearCookie,
                        icon: const Icon(Icons.delete_outline),
                        label: const Text('Clear cookie'),
                      ),
                    ],
                  )
                : const Text('No YouTube cookie set.'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _cookieCtrl,
            decoration: InputDecoration(
              labelText: 'Paste YouTube cookie',
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                icon: Icon(_cookieObscured
                    ? Icons.visibility_off
                    : Icons.visibility),
                onPressed: () =>
                    setState(() => _cookieObscured = !_cookieObscured),
              ),
            ),
            obscureText: _cookieObscured,
            maxLines: 1,
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _saving ? null : _saveCookie,
            child: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Save cookie'),
          ),
          const Divider(height: 32),

          // ── Backend selector ──────────────────────────────────────────
          Text('Default Backend',
              style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          settingsAsync.maybeWhen(
            data: (s) => DropdownButtonFormField<String>(
              initialValue: s.activePlugin,
              decoration: const InputDecoration(border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(
                    value: 'youtubejs', child: Text('youtube.js (default)')),
                DropdownMenuItem(value: 'ytdlp', child: Text('yt-dlp')),
              ],
              onChanged: (v) {
                if (v != null) {
                  ref
                      .read(apiClientProvider)
                      .patchSettings({'activePlugin': v})
                      .then((_) => ref.invalidate(settingsProvider));
                }
              },
            ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}
