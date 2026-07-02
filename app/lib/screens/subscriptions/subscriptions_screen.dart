import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import '../../providers/providers.dart';

class SubscriptionsScreen extends ConsumerWidget {
  const SubscriptionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subsAsync = ref.watch(subscriptionsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Subscriptions')),
      body: subsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (subs) {
          if (subs.isEmpty) {
            return const Center(
                child: Text('You haven\'t subscribed to any channels yet.'));
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(subscriptionsProvider.future),
            child: ListView.builder(
              itemCount: subs.length,
              itemBuilder: (_, i) {
                final s = subs[i];
                return ListTile(
                  leading: CircleAvatar(
                    backgroundImage: s.thumbnail != null
                        ? CachedNetworkImageProvider(s.thumbnail!)
                        : null,
                    child: s.thumbnail == null
                        ? Text(s.name.isNotEmpty
                            ? s.name[0].toUpperCase()
                            : '?')
                        : null,
                  ),
                  title: Text(s.name),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/channel/${s.channelId}'),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
