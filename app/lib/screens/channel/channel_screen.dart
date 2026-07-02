import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/video_card.dart';

final _channelInfoProvider =
    FutureProvider.family<ChannelInfo, String>((ref, id) {
  return ref.watch(apiClientProvider).getChannel(id);
});

final _channelVideosProvider =
    FutureProvider.family<List<ChannelVideo>, String>((ref, id) {
  return ref.watch(apiClientProvider).getChannelVideos(id, limit: 30);
});

final _channelPlaylistsProvider =
    FutureProvider.family<List<ChannelPlaylist>, String>((ref, id) {
  return ref.watch(apiClientProvider).getChannelPlaylists(id);
});

class ChannelScreen extends ConsumerStatefulWidget {
  final String channelId;
  const ChannelScreen({super.key, required this.channelId});

  @override
  ConsumerState<ChannelScreen> createState() => _ChannelScreenState();
}

class _ChannelScreenState extends ConsumerState<ChannelScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final infoAsync = ref.watch(_channelInfoProvider(widget.channelId));
    final videosAsync = ref.watch(_channelVideosProvider(widget.channelId));

    return Scaffold(
      body: infoAsync.when(
        loading: () =>
            const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (info) => NestedScrollView(
          headerSliverBuilder: (_, __) => [
            SliverAppBar(
              expandedHeight: 200,
              pinned: true,
              flexibleSpace: FlexibleSpaceBar(
                background: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (info.banner != null)
                      CachedNetworkImage(
                          imageUrl: info.banner!, fit: BoxFit.cover),
                    // Dark gradient so the avatar is readable
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.transparent,
                            Colors.black54,
                          ],
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: 12,
                      left: 16,
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 28,
                            backgroundImage: info.thumbnail != null
                                ? CachedNetworkImageProvider(info.thumbnail!)
                                : null,
                            child: info.thumbnail == null
                                ? const Icon(Icons.person, size: 28)
                                : null,
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(info.name,
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 18)),
                              if (info.subscriberCount != null)
                                Text(
                                  _fmtSubs(info.subscriberCount!),
                                  style: const TextStyle(
                                      color: Colors.white70, fontSize: 13),
                                ),
                            ],
                          ),
                          const SizedBox(width: 12),
                          _SubscribeButton(info: info),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              bottom: TabBar(
                controller: _tabs,
                tabs: const [
                  Tab(text: 'Videos'),
                  Tab(text: 'Playlists'),
                ],
              ),
            ),
          ],
          body: TabBarView(
            controller: _tabs,
            children: [
              // ── Videos tab ──────────────────────────────────────────
              videosAsync.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('Error: $e')),
                data: (videos) => GridView.builder(
                  padding: const EdgeInsets.all(12),
                  gridDelegate:
                      const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 380,
                    childAspectRatio: 0.72,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                  ),
                  itemCount: videos.length,
                  itemBuilder: (_, i) => VideoCard.fromChannelVideo(
                      videos[i], info.id, info.name),
                ),
              ),
              // ── Playlists tab ───────────────────────────────────────
              Consumer(builder: (_, ref, __) {
                final pl =
                    ref.watch(_channelPlaylistsProvider(widget.channelId));
                return pl.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Center(child: Text('Error: $e')),
                  data: (playlists) => ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: playlists.length,
                    itemBuilder: (_, i) {
                      final p = playlists[i];
                      return ListTile(
                        leading: p.thumbnail != null
                            ? CachedNetworkImage(
                                imageUrl: p.thumbnail!,
                                width: 72,
                                height: 48,
                                fit: BoxFit.cover,
                              )
                            : const Icon(Icons.playlist_play),
                        title: Text(p.title, maxLines: 2,
                            overflow: TextOverflow.ellipsis),
                        subtitle: p.videoCount != null
                            ? Text('${p.videoCount} videos')
                            : null,
                      );
                    },
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }

  String _fmtSubs(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M subscribers';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(0)}K subscribers';
    return '$n subscribers';
  }
}

class _SubscribeButton extends ConsumerStatefulWidget {
  final ChannelInfo info;
  const _SubscribeButton({required this.info});

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
    final v = await ref
        .read(apiClientProvider)
        .isSubscribed(widget.info.id)
        .catchError((_) => false);
    if (mounted) setState(() { _subscribed = v; _loading = false; });
  }

  Future<void> _toggle() async {
    if (_subscribed == null) return;
    setState(() => _loading = true);
    final client = ref.read(apiClientProvider);
    try {
      if (_subscribed!) {
        await client.unsubscribe(widget.info.id);
      } else {
        await client.subscribe(widget.info.id, widget.info.name,
            thumbnail: widget.info.thumbnail);
      }
      if (mounted) setState(() => _subscribed = !_subscribed!);
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
              backgroundColor:
                  Theme.of(context).colorScheme.surfaceContainerHighest,
              foregroundColor: Theme.of(context).colorScheme.onSurface,
            )
          : null,
      child: Text(_subscribed == true ? 'Subscribed' : 'Subscribe'),
    );
  }
}
