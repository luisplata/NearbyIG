import 'package:flutter_test/flutter_test.dart';
import 'package:nearbyig_demo/state/format.dart';

void main() {
  group('formatDistance', () {
    test('bajo 1000 m usa metros sin decimales', () {
      expect(formatDistance(0), '0 m');
      expect(formatDistance(200), '200 m');
      expect(formatDistance(240), '240 m');
      expect(formatDistance(999), '999 m');
    });

    test('desde 1000 m usa km con una decimal y coma', () {
      expect(formatDistance(1000), '1,0 km');
      expect(formatDistance(1150), '1,2 km');
      expect(formatDistance(1480), '1,5 km');
      expect(formatDistance(1950), '2,0 km');
      expect(formatDistance(2600), '2,6 km');
      expect(formatDistance(3200), '3,2 km');
      expect(formatDistance(4800), '4,8 km');
      expect(formatDistance(5000), '5,0 km');
    });

    test('formatRadius usa el mismo formato que formatDistance', () {
      for (final radius in <int>[500, 1000, 2000, 5000]) {
        expect(formatRadius(radius), formatDistance(radius));
      }
    });
  });
}
