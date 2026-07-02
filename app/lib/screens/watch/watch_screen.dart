import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:video_player/video_player.dart';
import 'package:chewie/chewie.dart';
import 'package:go_router/go_router.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';

final videoInfoProvider =
    FutureProvider.family<VideoInfo, String>((ref, id) {
  final client = ref.watch(apiClientProvider);
  return client.getVideo(id);
});

class WatchScreen extends ConsumerStatefulWidget {
  final String videoId;
  const WatchScreen({super.key, required this.videoId});

  @override
  ConsumerState<WatchScreen> createState() => _WatchScreenState();
}

class _WatchScreenState extends ConsumerState<WatchScreen> {
  VideoPlayerController? _vpc;
  ChewieController? _cc;
  bool _playerReady = false;
  bool _recordedWatch = false;

  @override
  void dispose() {
    _cc?.dispose();
    _vpc?.dispose();
    super.dispose();
  }

  Future<void> _initPlayer(VideoInfo info) async {
    if (_playerReady) return;

    // Pick best video stream (non-audio, highest bitrate)
    final stream = info.streams
        .where((s) => !s.isAudio)
        .fold<StreamUrl?>(null, (best, s) {
      if (best == null) return s;
      return (s.bitrate ?? 0) > (best.bitrate ?? 0) ? s : best;
    });

    if (stream == null) return;

    _vpc = VideoPlayerController.networkUrl(Uri.parse(stream.url));
    await _vpc!.initialize();

    _cc = ChewieController(
      videoPlayerController: _vpc!,
      autoPlay: true,
      looping: false,
    );

    if (!mounted) return;
    setState(() => _playerReady = true);

    if (!_recordedWatch) {
      _recordedWatch = true;
      ref.read(apiClientProvider).recordWatch(
            videoId: info.id,
            title: info.title,
            channelId: info.channelId,
            channelName: info.channelName,
            thumbnail: info.thumbnail,
            duration: info.duration,
          );
    }
  }

  @override
  Widget build(BuildContext context) {
    final infoAsync = ref.watch(videoInfoProvider(widget.videoId));

    return Scaffold(
      body: infoAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (info) {
          _initPlayer(info);
          return CustomScrollView(
            slivers: [
              // ── Player ──────────────────────────────────────────────
              SliverToBoxAdapter(
                child: AspectRatio(
                  aspectRatio: 16 / 9,
                  child: _playerReady && _cc != null
                      ? Chewie(controller: _cc!)
                      : const ColoredBox(
                          color: Colors.black,
                          child: Center(
                              child: CircularProgressIndicator(
                                  color: Colors.white))),
                ),
              ),
              // ── Title & channel ─────────────────────────────────────
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(info.title,
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: GestureDetector(
                              onTap: () =>
                                  context.push('/channel/${info.channelId}'),
                              child: Text(
                                info.channelName,
                                style: TextStyle(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .primary),
                              ),
                            ),
                          ),
                          _SubscribeButton(
                              channelId: info.channelId,
                              channelName: info.channelName,
                              thumbnail: info.thumbnail),
                        ],
                      ),
                      if (info.viewCount != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          '${_fmtViews(info.viewCount!)} views'
                          '${info.uploadDate != null ? ' • ${info.uploadDate}' : ''}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                      if (info.description != null &&
                          info.description!.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        const Divider(),
                        _ExpandableDescription(text: info.description!),
                      ]
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  String _fmtViews(int n) {
    if (n >= 1000000000) return '${(n / 1000000000).toStringAsFixed(1)}B';
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(0)}K';
    return '$n';
  }
}

// ── Subscribe button ────────────────────────────────────────────────────────

class _SubscribeButton extends ConsumerStatefulWidget {
  final String channelId;
  final String channelName;
  final String? thumbnail;

  const _SubscribeButton({
    required this.channelId,
    required this.channelName,
    this.thumbnail,
  });

  @override
  ConsumerState<_SubscribeButton> createState() => _SubscribeButtonState();
}

class _SubscribeButtonState extends ConsumerState<_SubscribeButton> {
  bool? _subscribed;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    final client = ref.read(apiClientProvider);
    final v = await client.isSubscribed(widget.channelId).catchError((_) => false);
    if (mounted) setState(() { _subscribed = v; _loading = false; });
  }

  Future<void> _toggle() async {
    if (_subscribed == null) return;
    final client = ref.read(apiClientProvider);
    setState(() => _loading = true);
    try {
      if (_subscribed!) {
        await client.unsubscribe(widget.channelId);
      } else {
        await client.subscribe(widget.channelId, widget.channelName,
            thumbnail: widget.thumbnail);
      }
      setState(() => _subscribed = !_subscribed!);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const SizedBox(
          width: 80,
          child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
    }
    return FilledButton(
      onPressed: _toggle,
      style: _subscribed == true
          ? FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
              foregroundColor: Theme.of(context).colorScheme.onSurface,
            )
          : null,
      child: Text(_subscribed == true ? 'Subscribed' : 'Subscribe'),
    );
  }
}

// ── Expandable description ────────────────────────────────────────────────────

class _ExpandableDescription extends StatefulWidget {
  final String text;
  const _ExpandableDescription({required this.text});

  @override
  State<_ExpandableDescription> createState() =>
      _ExpandableDescriptionState();
}

class _ExpandableDescriptionState extends State<_ExpandableDescription> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => setState(() => _expanded = !_expanded),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.text,
            maxLines: _expanded ? null : 3,
            overflow:
                _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 4),
          Text(
            _expanded ? 'Show less' : 'Show more',
            style: TextStyle(
                color: Theme.of(context).colorScheme.primary,
                fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
