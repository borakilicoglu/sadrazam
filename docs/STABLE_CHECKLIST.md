# Stable Checklist

## Release blockers

- `unused files` en az 2 gerçek projede güvenilir sonuç versin.
- `unused exports` en az 2 gerçek projede kabul edilebilir false positive seviyesiyle çalışsın.
- TypeScript, monorepo ve CommonJS doğrulama turu yeni feature set ile tekrar geçilsin.
- README mevcut feature seti tam yansıtsın.
- Docs site içinde `unused files` ve `unused exports` ilgili bölümleri eklensin.
- `--help` çıktısı yeni bulgu türlerini ve kullanım örneklerini kapsasın.
- JSON reporter yüzeyi dokümante edilsin.
- `latest` publish akışı bir kez daha sorunsuz doğrulansın.
- GitHub Actions publish ve docs deploy akışları yeşil kalsın.
- `0.1.0` changelog girdisi temiz bir release özeti taşısın.
- Bilinen limitasyonlar açıkça yazılsın.
- En az bir manuel `npx sadrazam` gerçek dünya denemesi daha yapılsın.
- Kritik açık bug kalmasın.

## Suggested order

1. Real-world validation
2. Docs and README update
3. Stable release prep
4. `v0.1.0`
