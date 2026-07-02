import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import '../models/models.dart';

String _formatDuration(int? seconds) {
  if (seconds == null) return '';
  final h = seconds ~/ 3600;
  final m = (seconds % 3600) ~/ 60;
  final s = seconds % 60;
  if (h > 0) {
    return '$h:${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }
  return '$m:${s.toString().padLeft(2, '0')}';
}

class VideoCard extends StatelessWidget {
  final String id;
  final String title;
  final String channelId;
  final String channelName;
  final String? thumbnail;
  final int? duration;
  final String? meta;

  const VideoCard({
    super.key,
    required this.id,
    required this.title,
    required this.channelId,
    required this.channelName,
    this.thumbnail,
    this.duration,
    this.meta,
  });

  factory VideoCard.fromSearchResult(SearchResult r) => VideoCard(
        id: r.id,
        title: r.title,
        channelId: r.channelId,
        channelName: r.channelName,
        thumbnail: r.thumbnail,
        duration: r.duration,
        meta: r.publishedText,
      );

  factory VideoCard.fromChannelVideo(ChannelVideo v, String channelId,
      String channelName) =>
      VideoCard(
        id: v.id,
        title: v.title,
        channelId: channelId,
        channelName: channelName,
        thumbnail: v.thumbnail,
        duration: v.duration,
        meta: v.publishedText,
      );

  factory VideoCard.fromHistoryEntry(HistoryEntry e) => VideoCard(
        id: e.videoId,
        title: e.title,
        channelId: e.channelId,
        channelName: e.channelName,
        thumbnail: e.thumbnail,
        duration: e.duration,
      );

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.hardEdge,
      child: InkWell(
        onTap: () => context.push('/watch/$id'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Thumbnail ───────────────────────────────────────────────
            Stack(
              children: [
                AspectRatio(
                  aspectRatio: 16 / 9,
                  child: thumbnail != null
                      ? CachedNetworkImage(
                          imageUrl: thumbnail!,
                          fit: BoxFit.cover,
                          placeholder: (_, __) => const ColoredBox(
                              color: Color(0xFF1e1e2e)),
                          errorWidget: (_, __, ___) =>
                              const Icon(Icons.broken_image),
                        )
                      : const ColoredBox(color: Color(0xFF1e1e2e)),
                ),
                if (duration != null)
                  Positioned(
                    bottom: 6,
                    right: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 5, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.black87,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        _formatDuration(duration),
                        style: const TextStyle(
                            color: Colors.white, fontSize: 11),
                      ),
                    ),
                  ),
              ],
            ),
            // ── Info ────────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context)
                          .textTheme
                          .bodyMedium
                          ?.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  GestureDetector(
                    onTap: () => context.push('/channel/$channelId'),
                    child: Text(channelName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(
                                color: Theme.of(context).colorScheme.primary)),
                  ),
                  if (meta != null) ...[
                    const SizedBox(height: 2),
                    Text(meta!,
                        style: Theme.of(context).textTheme.bodySmall),
                  ]
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
