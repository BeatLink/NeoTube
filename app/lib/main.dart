import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'router.dart';
import 'services/server_manager.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (Platform.isLinux || Platform.isMacOS || Platform.isWindows) {
    await _startServerWithSplash();
  }

  runApp(const ProviderScope(child: NeoTubeApp()));
}

// On desktop, attempt to start the local server before rendering the UI.
// If it fails (e.g. node not found), the app still launches — the user
// can configure an external server URL in Settings.
Future<void> _startServerWithSplash() async {
  final ok = await serverManager.start();
  if (!ok) {
    debugPrint(
        'Local server did not start. Configure a remote server in Settings.');
  }
}

class NeoTubeApp extends StatefulWidget {
  const NeoTubeApp({super.key});

  @override
  State<NeoTubeApp> createState() => _NeoTubeAppState();
}

class _NeoTubeAppState extends State<NeoTubeApp> {
  @override
  void dispose() {
    if (Platform.isLinux || Platform.isMacOS || Platform.isWindows) {
      serverManager.stop();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'NeoTube',
      routerConfig: router,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1565C0),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1565C0),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      themeMode: ThemeMode.system,
    );
  }
}
