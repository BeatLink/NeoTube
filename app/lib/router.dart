import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'screens/home/home_screen.dart';
import 'screens/search/search_screen.dart';
import 'screens/watch/watch_screen.dart';
import 'screens/channel/channel_screen.dart';
import 'screens/subscriptions/subscriptions_screen.dart';
import 'screens/history/history_screen.dart';
import 'screens/settings/settings_screen.dart';

final router = GoRouter(
  initialLocation: '/',
  routes: [
    ShellRoute(
      builder: (context, state, child) => _Shell(child: child),
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => const HomeScreen(),
        ),
        GoRoute(
          path: '/search',
          builder: (_, __) => const SearchScreen(),
        ),
        GoRoute(
          path: '/subscriptions',
          builder: (_, __) => const SubscriptionsScreen(),
        ),
        GoRoute(
          path: '/history',
          builder: (_, __) => const HistoryScreen(),
        ),
        GoRoute(
          path: '/settings',
          builder: (_, __) => const SettingsScreen(),
        ),
      ],
    ),
    // Full-screen routes (no nav bar)
    GoRoute(
      path: '/watch/:id',
      builder: (_, state) =>
          WatchScreen(videoId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/channel/:id',
      builder: (_, state) =>
          ChannelScreen(channelId: state.pathParameters['id']!),
    ),
  ],
);

class _Shell extends StatelessWidget {
  final Widget child;
  const _Shell({required this.child});

  static const _tabs = [
    (path: '/', label: 'Home', icon: Icons.home_outlined, activeIcon: Icons.home),
    (path: '/search', label: 'Search', icon: Icons.search, activeIcon: Icons.search),
    (path: '/subscriptions', label: 'Subs', icon: Icons.subscriptions_outlined, activeIcon: Icons.subscriptions),
    (path: '/history', label: 'History', icon: Icons.history, activeIcon: Icons.history),
    (path: '/settings', label: 'Settings', icon: Icons.settings_outlined, activeIcon: Icons.settings),
  ];

  int _currentIndex(BuildContext context) {
    final loc = GoRouterState.of(context).uri.path;
    for (var i = 0; i < _tabs.length; i++) {
      if (_tabs[i].path == loc) return i;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final idx = _currentIndex(context);
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: idx,
        onDestinationSelected: (i) => context.go(_tabs[i].path),
        destinations: _tabs
            .map((t) => NavigationDestination(
                  icon: Icon(t.icon),
                  selectedIcon: Icon(t.activeIcon),
                  label: t.label,
                ))
            .toList(),
      ),
    );
  }
}
