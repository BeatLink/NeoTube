import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neotube/main.dart';

void main() {
  testWidgets('App renders without crashing', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: NeoTubeApp()),
    );
    // The router shell renders; just ensure no exception is thrown.
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
