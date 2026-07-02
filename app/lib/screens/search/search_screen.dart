import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/video_card.dart';

final _queryProvider = StateProvider<String>((_) => '');

final searchResultsProvider =
    FutureProvider.family<List<SearchResult>, String>((ref, query) {
  if (query.isEmpty) return Future.value([]);
  final client = ref.watch(apiClientProvider);
  return client.search(query, limit: 30);
});

class SearchScreen extends ConsumerWidget {
  const SearchScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(_queryProvider);
    final results = ref.watch(searchResultsProvider(query));

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Search YouTube…',
            border: InputBorder.none,
          ),
          textInputAction: TextInputAction.search,
          onSubmitted: (v) =>
              ref.read(_queryProvider.notifier).state = v.trim(),
        ),
        actions: [
          if (query.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.close),
              onPressed: () =>
                  ref.read(_queryProvider.notifier).state = '',
            ),
        ],
      ),
      body: results.when(
        loading: () =>
            const Center(child: CircularProgressIndicator()),
        error: (e, _) =>
            Center(child: Text('Error: $e')),
        data: (items) {
          if (items.isEmpty && query.isNotEmpty) {
            return const Center(child: Text('No results.'));
          }
          if (items.isEmpty) {
            return const Center(
                child: Text('Type a search query above.'));
          }
          return GridView.builder(
            padding: const EdgeInsets.all(12),
            gridDelegate:
                const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 380,
              childAspectRatio: 0.72,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
            ),
            itemCount: items.length,
            itemBuilder: (_, i) =>
                VideoCard.fromSearchResult(items[i]),
          );
        },
      ),
    );
  }
}
