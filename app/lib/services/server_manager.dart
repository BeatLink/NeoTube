import 'dart:io';

// Manages the lifecycle of the NeoTube Fastify server as a child process.
// Only active on Linux (and future desktop targets); mobile connects to a
// remote server whose URL is configured in Settings.
class ServerManager {
  Process? _process;
  bool _running = false;

  bool get isRunning => _running;

  // Finds the server directory.
  // Priority: NEOTUBE_SERVER_PATH env var → ../server relative to exe.
  String? _resolveServerPath() {
    final fromEnv = Platform.environment['NEOTUBE_SERVER_PATH'];
    if (fromEnv != null && fromEnv.isNotEmpty) {
      return fromEnv;
    }
    // When running `flutter run`, the exe is in build/.../bundle/neotube.
    // Walk up until we find a directory that contains server/package.json.
    var dir = File(Platform.resolvedExecutable).parent;
    for (var i = 0; i < 8; i++) {
      final candidate = Directory('${dir.path}/server');
      if (File('${candidate.path}/package.json').existsSync()) {
        return candidate.path;
      }
      final parent = dir.parent;
      if (parent.path == dir.path) break;
      dir = parent;
    }
    return null;
  }

  Future<String?> _resolveNodeBin() async {
    // Prefer the node binary from NEOTUBE_NODE_PATH env var.
    final fromEnv = Platform.environment['NEOTUBE_NODE_PATH'];
    if (fromEnv != null && fromEnv.isNotEmpty) return fromEnv;

    // Fall back to `which node`.
    try {
      final result = await Process.run('which', ['node']);
      final path = (result.stdout as String).trim();
      if (path.isNotEmpty) return path;
    } catch (_) {}
    return null;
  }

  // Starts the server. Returns true if it started (or was already running).
  Future<bool> start() async {
    if (_running) return true;

    // If already listening (e.g. started externally), skip.
    if (await _ping()) {
      _running = true;
      return true;
    }

    final serverPath = _resolveServerPath();
    if (serverPath == null) {
      debugLog('Server path not found. Set NEOTUBE_SERVER_PATH.');
      return false;
    }

    final node = await _resolveNodeBin();
    if (node == null) {
      debugLog('node not found in PATH. Cannot start server.');
      return false;
    }

    final mode = Platform.environment['NEOTUBE_SERVER_MODE'] ?? 'dev';
    final args = mode == 'prod'
        ? ['dist/index.js']
        : ['--import', 'tsx/esm', 'src/index.ts'];

    debugLog('Starting server: $node ${args.join(' ')} in $serverPath');

    _process = await Process.start(
      node,
      args,
      workingDirectory: serverPath,
      environment: {
        ...Platform.environment,
        'NEOTUBE_PORT': Platform.environment['NEOTUBE_PORT'] ?? '7700',
      },
    );

    _process!.stdout
        .transform(const SystemEncoding().decoder)
        .listen((s) => debugLog('[server] $s'));
    _process!.stderr
        .transform(const SystemEncoding().decoder)
        .listen((s) => debugLog('[server:err] $s'));

    _process!.exitCode.then((code) {
      debugLog('Server exited with code $code');
      _running = false;
      _process = null;
    });

    // Wait up to 10 s for the server to be ready.
    for (var i = 0; i < 20; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      if (await _ping()) {
        _running = true;
        debugLog('Server ready.');
        return true;
      }
    }

    debugLog('Server did not become ready in time.');
    return false;
  }

  Future<void> stop() async {
    _process?.kill(ProcessSignal.sigterm);
    await _process?.exitCode.timeout(
      const Duration(seconds: 5),
      onTimeout: () {
        _process?.kill(ProcessSignal.sigkill);
        return -1;
      },
    );
    _process = null;
    _running = false;
  }

  Future<bool> _ping() async {
    try {
      final port = int.tryParse(
              Platform.environment['NEOTUBE_PORT'] ?? '7700') ??
          7700;
      final socket = await Socket.connect('127.0.0.1', port,
          timeout: const Duration(milliseconds: 300));
      socket.destroy();
      return true;
    } catch (_) {
      return false;
    }
  }

  static void debugLog(String msg) {
    // ignore: avoid_print
    if (const bool.fromEnvironment('dart.vm.product') == false) {
      // ignore: avoid_print
      print(msg);
    }
  }
}

// Global singleton — app starts it on Linux, ignores it on mobile.
final serverManager = ServerManager();
