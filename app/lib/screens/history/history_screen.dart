import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/providers.dart';
import '../../widgets/video_card.dart';

class HistoryScreen extends ConsumerWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historyAsync = ref.watch(historyProvider);
    final client = ref.read(apiClientProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Watch History'),
        actions: [
          historyAsync.maybeWhen(
            data: (h) => h.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.delete_sweep),
                    tooltip: 'Clear history',
                    onPressed: () async {
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (_) => AlertDialog(
                          title: const Text('Clear history?'),
                          content: const Text(
                              'This will remove all watch history from the server.'),
                          actions: [
                            TextButton(
                                onPressed: () =>
                                    Navigator.pop(context, false),
                                child: const Text('Cancel')),
                            FilledButton(
                                onPressed: () =>
                                    Navigator.pop(context, true),
                                child: const Text('Clear')),
                          ],
                        ),
                      );
                      if (ok == true) {
                        await client.clearHistory();
                        ref.invalidate(historyProvider);
                      }
                    },
                  )
                : const SizedBox.shrink(),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: historyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (entries) {
          if (entries.isEmpty) {
            return const Center(child: Text('No watch history yet.'));
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(historyProvider.future),
            child: GridView.builder(
              padding: const EdgeInsets.all(12),
              gridDelegate:
                  const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 380,
                childAspectRatio: 0.72,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
              ),
              itemCount: entries.length,
              itemBuilder: (_, i) =>
                  VideoCard.fromHistoryEntry(entries[i]),
            ),
          );
        },
      ),
    );
  }
}
