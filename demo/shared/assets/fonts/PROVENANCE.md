# Font provenance

## Inter

| Campo | Valor |
|---|---|
| Familia | Inter |
| Versión | 4.1 (`Inter-4.1.zip` de `github.com/rsms/inter`, releases) |
| Archivos | `Inter-Regular.ttf` (400), `Inter-SemiBold.ttf` (600) |
| Origen en el release | `extras/ttf/` (instancias estáticas) |
| Licencia | SIL Open Font License 1.1 — ver `OFL.txt` |
| Uso | Bundle local en Flutter (CanvasKit) y Expo (RNW). Cero CDNs, cero Google Fonts en runtime |

Los TTF se commitean verbatim (mismos bytes que el release). No se usan fuentes del
sistema para evitar diferencias de renderizado entre apps.

## Hashes

Los verifica `node scripts/sync-demo-assets.mjs`. Si cambian, hay que actualizar esta
tabla y regenerar las copias de ambas apps.

```text
sha256  Inter-Regular.ttf   40d692fce188e4471e2b3cba937be967878f631ad3ebbbdcd587687c7ebe0c82
sha256  Inter-SemiBold.ttf  78a843fade9d4612a5567302fb595b56976eb5fcebf4fea5a5912d638bafcde3
sha256  OFL.txt             262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a
```
