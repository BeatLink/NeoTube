// Mirror of server/src/types.ts — keep in sync with the API contract.

class StreamUrl {
  final String url;
  final String? qualityLabel;
  final String? mimeType;
  final int? bitrate;
  final bool isAudio;

  const StreamUrl({
    required this.url,
    this.qualityLabel,
    this.mimeType,
    this.bitrate,
    this.isAudio = false,
  });

  factory StreamUrl.fromJson(Map<String, dynamic> j) => StreamUrl(
        url: j['url'] as String,
        qualityLabel: j['qualityLabel'] as String?,
        mimeType: j['mimeType'] as String?,
        bitrate: j['bitrate'] as int?,
        isAudio: j['isAudio'] as bool? ?? false,
      );
}

class VideoInfo {
  final String id;
  final String title;
  final String? description;
  final String channelId;
  final String channelName;
  final String? thumbnail;
  final int? duration;
  final int? viewCount;
  final String? uploadDate;
  final List<StreamUrl> streams;

  const VideoInfo({
    required this.id,
    required this.title,
    this.description,
    required this.channelId,
    required this.channelName,
    this.thumbnail,
    this.duration,
    this.viewCount,
    this.uploadDate,
    required this.streams,
  });

  factory VideoInfo.fromJson(Map<String, dynamic> j) => VideoInfo(
        id: j['id'] as String,
        title: j['title'] as String,
        description: j['description'] as String?,
        channelId: j['channelId'] as String,
        channelName: j['channelName'] as String,
        thumbnail: j['thumbnail'] as String?,
        duration: j['duration'] as int?,
        viewCount: j['viewCount'] as int?,
        uploadDate: j['uploadDate'] as String?,
        streams: (j['streams'] as List<dynamic>? ?? [])
            .map((e) => StreamUrl.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class SearchResult {
  final String id;
  final String title;
  final String channelId;
  final String channelName;
  final String? thumbnail;
  final int? duration;
  final int? viewCount;
  final String? publishedText;

  const SearchResult({
    required this.id,
    required this.title,
    required this.channelId,
    required this.channelName,
    this.thumbnail,
    this.duration,
    this.viewCount,
    this.publishedText,
  });

  factory SearchResult.fromJson(Map<String, dynamic> j) => SearchResult(
        id: j['id'] as String,
        title: j['title'] as String,
        channelId: j['channelId'] as String,
        channelName: j['channelName'] as String,
        thumbnail: j['thumbnail'] as String?,
        duration: j['duration'] as int?,
        viewCount: j['viewCount'] as int?,
        publishedText: j['publishedText'] as String?,
      );
}

class ChannelInfo {
  final String id;
  final String name;
  final String? description;
  final String? thumbnail;
  final String? banner;
  final int? subscriberCount;

  const ChannelInfo({
    required this.id,
    required this.name,
    this.description,
    this.thumbnail,
    this.banner,
    this.subscriberCount,
  });

  factory ChannelInfo.fromJson(Map<String, dynamic> j) => ChannelInfo(
        id: j['id'] as String,
        name: j['name'] as String,
        description: j['description'] as String?,
        thumbnail: j['thumbnail'] as String?,
        banner: j['banner'] as String?,
        subscriberCount: j['subscriberCount'] as int?,
      );
}

class ChannelVideo {
  final String id;
  final String title;
  final String? thumbnail;
  final int? duration;
  final int? viewCount;
  final String? publishedText;

  const ChannelVideo({
    required this.id,
    required this.title,
    this.thumbnail,
    this.duration,
    this.viewCount,
    this.publishedText,
  });

  factory ChannelVideo.fromJson(Map<String, dynamic> j) => ChannelVideo(
        id: j['id'] as String,
        title: j['title'] as String,
        thumbnail: j['thumbnail'] as String?,
        duration: j['duration'] as int?,
        viewCount: j['viewCount'] as int?,
        publishedText: j['publishedText'] as String?,
      );
}

class ChannelPlaylist {
  final String id;
  final String title;
  final String? thumbnail;
  final int? videoCount;

  const ChannelPlaylist({
    required this.id,
    required this.title,
    this.thumbnail,
    this.videoCount,
  });

  factory ChannelPlaylist.fromJson(Map<String, dynamic> j) => ChannelPlaylist(
        id: j['id'] as String,
        title: j['title'] as String,
        thumbnail: j['thumbnail'] as String?,
        videoCount: j['videoCount'] as int?,
      );
}

class Subscription {
  final String channelId;
  final String name;
  final String? thumbnail;

  const Subscription({
    required this.channelId,
    required this.name,
    this.thumbnail,
  });

  factory Subscription.fromJson(Map<String, dynamic> j) => Subscription(
        channelId: j['channelId'] as String,
        name: j['name'] as String,
        thumbnail: j['thumbnail'] as String?,
      );
}

class HistoryEntry {
  final String videoId;
  final String title;
  final String channelId;
  final String channelName;
  final String? thumbnail;
  final int? duration;
  final String watchedAt;

  const HistoryEntry({
    required this.videoId,
    required this.title,
    required this.channelId,
    required this.channelName,
    this.thumbnail,
    this.duration,
    required this.watchedAt,
  });

  factory HistoryEntry.fromJson(Map<String, dynamic> j) => HistoryEntry(
        videoId: j['videoId'] as String,
        title: j['title'] as String,
        channelId: j['channelId'] as String,
        channelName: j['channelName'] as String,
        thumbnail: j['thumbnail'] as String?,
        duration: j['duration'] as int?,
        watchedAt: j['watchedAt'] as String,
      );
}

class UserSettings {
  final String activePlugin;
  final String? ytCookie;
  final String? ytdlpPath;

  const UserSettings({
    required this.activePlugin,
    this.ytCookie,
    this.ytdlpPath,
  });

  factory UserSettings.fromJson(Map<String, dynamic> j) => UserSettings(
        activePlugin: j['activePlugin'] as String? ?? 'youtubejs',
        ytCookie: j['ytCookie'] as String?,
        ytdlpPath: j['ytdlpPath'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'activePlugin': activePlugin,
        if (ytCookie != null) 'ytCookie': ytCookie,
        if (ytdlpPath != null) 'ytdlpPath': ytdlpPath,
      };
}
