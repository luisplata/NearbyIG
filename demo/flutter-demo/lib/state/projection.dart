import 'dart:convert';

import '../generated/fixtures.dart';
import 'demo_state.dart';

/// Proyección normada del estado (state-machine.md §8). Es un texto de líneas
/// `clave=valor`: no depende del orden de claves de un JSON, así que Dart y TS
/// producen el mismo digest.
///
/// Reglas de serialización:
/// - `null` → `-`; booleanos → `1` / `0`.
/// - Listas → orden ascendente, unidas por `,`; lista vacía → `-`.
/// - `filter.intentions` → `-` si es `null`; si no, en el orden del dataset.
/// - `messages` → chats por `id` ascendente, cada uno `id:` seguido de
///   `from=textKey` unidos por `+`; chats unidos por `;`; sin chats → `-`.
/// - `notifications` → `id:kind:profileId:read` en orden de creación, unidos
///   por `;`.
/// - `toast` → `id:textKey` o `-`.
String projectState(DemoState state) {
  final lines = <String>[
    'view=${state.view.name}',
    'overlay=${state.overlay?.name ?? '-'}',
    'profileId=${state.profileId ?? '-'}',
    'chatId=${state.chatId ?? '-'}',
    'selfIntention=${state.selfIntention.name}',
    'ghost=${_bool(state.ghost)}',
    'radiusM=${state.filters.radiusM}',
    'filter.intentions=${_intentions(state.filters.intentions)}',
    'filter.gender=${state.filters.gender?.name ?? '-'}',
    'filter.verifiedOnly=${_bool(state.filters.verifiedOnly)}',
    'filter.onlineOnly=${_bool(state.filters.onlineOnly)}',
    'pingsSent=${_list(state.pingsSent)}',
    'incomingPings=${_list(state.incomingPings)}',
    'matches=${_list(state.matches)}',
    'revealedByMe=${_list(state.revealedByMe)}',
    'revealedByPeer=${_list(state.revealedByPeer)}',
    'messages=${_messages(state.messages)}',
    'typing=${state.typing ?? '-'}',
    'notifications=${_notifications(state.notifications)}',
    'blocked=${_list(state.blocked)}',
    'verification=${state.verification.name}',
    'matchCelebration=${state.matchCelebration ?? '-'}',
    'toast=${state.toast == null ? '-' : '${state.toast!.id}:${state.toast!.textKey}'}',
  ];
  return lines.join('\n');
}

String _bool(bool value) => value ? '1' : '0';

String _list(List<String> values) {
  if (values.isEmpty) {
    return '-';
  }
  final sorted = List<String>.of(values)..sort();
  return sorted.join(',');
}

String _intentions(List<Intention>? intentions) {
  if (intentions == null) {
    return '-';
  }
  final ordered = <String>[];
  for (final intention in kFilters.intentions) {
    if (intentions.contains(intention)) {
      ordered.add(intention.name);
    }
  }
  return ordered.isEmpty ? '-' : ordered.join(',');
}

String _messages(Map<String, List<ChatMessage>> messages) {
  if (messages.isEmpty) {
    return '-';
  }
  final keys = messages.keys.toList()..sort();
  final entries = <String>[];
  for (final key in keys) {
    final body = messages[key]!
        .map((message) => '${message.from.name}=${message.textKey}')
        .join('+');
    entries.add('$key:$body');
  }
  return entries.join(';');
}

String _notifications(List<DemoNotification> notifications) {
  if (notifications.isEmpty) {
    return '-';
  }
  return notifications
      .map(
        (notification) =>
            '${notification.id}:${notification.kind.name}:'
            '${notification.profileId}:${_bool(notification.read)}',
      )
      .join(';');
}

/// Longitud del digest acordada con el contrato (`golden/steps.json`).
const int kDigestLength = 12;

/// Digest de paridad: `sha256(projection)[0..12]`.
String digestOf(DemoState state) =>
    sha256Hex(utf8.encode(projectState(state))).substring(0, kDigestLength);

// --- SHA-256 (dart:core solamente: la demo no usa paquetes de terceros) -----

const List<int> _k = <int>[
  0x428a2f98,
  0x71374491,
  0xb5c0fbcf,
  0xe9b5dba5,
  0x3956c25b,
  0x59f111f1,
  0x923f82a4,
  0xab1c5ed5,
  0xd807aa98,
  0x12835b01,
  0x243185be,
  0x550c7dc3,
  0x72be5d74,
  0x80deb1fe,
  0x9bdc06a7,
  0xc19bf174,
  0xe49b69c1,
  0xefbe4786,
  0x0fc19dc6,
  0x240ca1cc,
  0x2de92c6f,
  0x4a7484aa,
  0x5cb0a9dc,
  0x76f988da,
  0x983e5152,
  0xa831c66d,
  0xb00327c8,
  0xbf597fc7,
  0xc6e00bf3,
  0xd5a79147,
  0x06ca6351,
  0x14292967,
  0x27b70a85,
  0x2e1b2138,
  0x4d2c6dfc,
  0x53380d13,
  0x650a7354,
  0x766a0abb,
  0x81c2c92e,
  0x92722c85,
  0xa2bfe8a1,
  0xa81a664b,
  0xc24b8b70,
  0xc76c51a3,
  0xd192e819,
  0xd6990624,
  0xf40e3585,
  0x106aa070,
  0x19a4c116,
  0x1e376c08,
  0x2748774c,
  0x34b0bcb5,
  0x391c0cb3,
  0x4ed8aa4a,
  0x5b9cca4f,
  0x682e6ff3,
  0x748f82ee,
  0x78a5636f,
  0x84c87814,
  0x8cc70208,
  0x90befffa,
  0xa4506ceb,
  0xbef9a3f7,
  0xc67178f2,
];

const int _mask32 = 0xFFFFFFFF;

int _rotr(int value, int bits) =>
    ((value >> bits) | (value << (32 - bits))) & _mask32;

/// SHA-256 en hex minúsculas, implementado sobre `dart:core` para que el dumper
/// del golden (`dart run tool/dump_golden.dart`) no necesite dependencias.
String sha256Hex(List<int> input) {
  final message = List<int>.of(input);
  final bitLength = message.length * 8;

  message.add(0x80);
  while (message.length % 64 != 56) {
    message.add(0);
  }
  final high = (bitLength ~/ 0x100000000) & _mask32;
  final low = bitLength & _mask32;
  for (final word in <int>[high, low]) {
    message
      ..add((word >> 24) & 0xFF)
      ..add((word >> 16) & 0xFF)
      ..add((word >> 8) & 0xFF)
      ..add(word & 0xFF);
  }

  final state = <int>[
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ];
  final schedule = List<int>.filled(64, 0);

  for (var offset = 0; offset < message.length; offset += 64) {
    for (var i = 0; i < 16; i += 1) {
      final base = offset + i * 4;
      schedule[i] =
          ((message[base] << 24) |
              (message[base + 1] << 16) |
              (message[base + 2] << 8) |
              message[base + 3]) &
          _mask32;
    }
    for (var i = 16; i < 64; i += 1) {
      final w15 = schedule[i - 15];
      final w2 = schedule[i - 2];
      final s0 = _rotr(w15, 7) ^ _rotr(w15, 18) ^ (w15 >> 3);
      final s1 = _rotr(w2, 17) ^ _rotr(w2, 19) ^ (w2 >> 10);
      schedule[i] = (schedule[i - 16] + s0 + schedule[i - 7] + s1) & _mask32;
    }

    var a = state[0];
    var b = state[1];
    var c = state[2];
    var d = state[3];
    var e = state[4];
    var f = state[5];
    var g = state[6];
    var h = state[7];

    for (var i = 0; i < 64; i += 1) {
      final sigma1 = _rotr(e, 6) ^ _rotr(e, 11) ^ _rotr(e, 25);
      final choice = (e & f) ^ ((~e & _mask32) & g);
      final temp1 = (h + sigma1 + choice + _k[i] + schedule[i]) & _mask32;
      final sigma0 = _rotr(a, 2) ^ _rotr(a, 13) ^ _rotr(a, 22);
      final majority = (a & b) ^ (a & c) ^ (b & c);
      final temp2 = (sigma0 + majority) & _mask32;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) & _mask32;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) & _mask32;
    }

    state[0] = (state[0] + a) & _mask32;
    state[1] = (state[1] + b) & _mask32;
    state[2] = (state[2] + c) & _mask32;
    state[3] = (state[3] + d) & _mask32;
    state[4] = (state[4] + e) & _mask32;
    state[5] = (state[5] + f) & _mask32;
    state[6] = (state[6] + g) & _mask32;
    state[7] = (state[7] + h) & _mask32;
  }

  final buffer = StringBuffer();
  for (final word in state) {
    buffer.write(word.toRadixString(16).padLeft(8, '0'));
  }
  return buffer.toString();
}
