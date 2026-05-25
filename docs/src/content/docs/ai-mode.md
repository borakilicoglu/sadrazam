---
title: AI Mode
---

# AI Mode

Sadrazam works without AI. The scanner stays useful on its own.

AI mode adds short summaries and prioritization on top of the base findings.

## Environment Variables

```bash
AI_PROVIDER=openai
AI_TOKEN=your_token
AI_MODEL=gpt-4.1
```

## Providers

- `openai`
- `anthropic`
- `gemini`

## Examples

```bash
AI_PROVIDER=openai AI_TOKEN=your_token sadrazam . --ai
AI_PROVIDER=anthropic AI_TOKEN=your_token sadrazam . --ai
AI_PROVIDER=gemini AI_TOKEN=your_token sadrazam . --ai
```

You can also override provider and model from the CLI:

```bash
sadrazam . --ai --provider openai --model gpt-4.1
```

## Current Limits

AI mode does not perform automatic fixes or deterministic multi-step remediation.
