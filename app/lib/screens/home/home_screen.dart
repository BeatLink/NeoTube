import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/video_card.dart';
import '../../widgets/async_value_widget.dart';

// Loads the latest videos from each subscription and merges them.
final feedProvider = FutureProvider<List<ChannelVideo>>((ref) async {
  final client = ref.watch(apiClientProvider);
  final subs = await client.getSubscriptions();
  if (subs.isEmpty) return [];

  final results = await Future.wait(
    subs.map((s) => client
        .getChannelVideos(s.channelId, limit: 10)
        .catchError((_) => <ChannelVideo>[])),
  );
  final flat = results.expand((v) => v).toList();
  return flat;
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(feedProvider);
    final subs = ref.watch(subscriptionsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('NeoTube'),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () => context.push('/search'),
          ),
        ],
      ),
      body: subs.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _noServerBanner(context, e),
        data: (subscriptions) {
          if (subscriptions.isEmpty) {
            return _emptyState(context);
          }
          return AsyncValueWidget(
            value: feed,
            data: (videos) {
              if (videos.isEmpty) {
                return const Center(child: Text('No videos in feed.'));
              }
              return RefreshIndicator(
                onRefresh: () =>
                    ref.refresh(feedProvider.future),
                child: GridView.builder(
                  padding: const EdgeInsets.all(12),
                  gridDelegate:
                      const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 380,
                    childAspectRatio: 0.72,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                  ),
                  itemCount: videos.length,
                  itemBuilder: (_, i) {
                    final sub = subscriptions.firstWhere(
                      (s) => true,
                      orElse: () => const Subscription(
                          channelId: '', name: 'Unknown'),
                    );
                    return VideoCard.fromChannelVideo(
                        videos[i], sub.channelId, sub.name);
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _emptyState(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.subscriptions_outlined, size: 64),
          const SizedBox(height: 16),
          Text('No subscriptions yet.',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ElevatedButton(
            onPressed: () => context.push('/search'),
            child: const Text('Find channels'),
          ),
        ],
      ),
    );
  }

  Widget _noServerBanner(BuildContext context, Object error) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, size: 64),
            const SizedBox(height: 16),
            Text('Cannot reach server',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(error.toString(),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => context.push('/settings'),
              child: const Text('Configure server'),
            ),
          ],
        ),
      ),
    );
  }
}
