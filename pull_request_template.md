## Summary
<!-- What does this PR do? One sentence. -->

## Type
- [ ] New Azure service
- [ ] Price update
- [ ] Bug fix
- [ ] Feature / UI improvement
- [ ] Documentation
- [ ] Refactor

## Services affected
<!-- List any services added, changed, or removed -->

## Pricing verification
<!-- For price updates or new services — confirm API query used -->
```
# Query used to verify prices (Canada Central):
curl "https://prices.azure.com/api/retail/prices?$filter=..."
```

## Checklist
- [ ] `npm run dev` works without errors
- [ ] `npm run build` completes without errors
- [ ] New service has `PRICES_USD` entry with source comment + date
- [ ] New service has `CTX` context description
- [ ] New service in donut chart + legend
- [ ] New service in `generateMemo` and `generateExport`
- [ ] No hardcoded prices (all in `PRICES_USD`)

## Screenshots (if UI change)
<!-- Before / After -->
