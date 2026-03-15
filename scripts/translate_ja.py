#!/usr/bin/env python3
import json, re, sys, time
from pathlib import Path
from deep_translator import GoogleTranslator

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'tests.json'
CACHE = ROOT / 'data' / 'ja_translate_cache.json'

JP_RE = re.compile(r'[ぁ-んァ-ヶ一-龥]')

SERVICE_DOCS = {
    'Amazon Bedrock': 'https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html',
    'AWS Lambda': 'https://docs.aws.amazon.com/lambda/latest/dg/welcome.html',
    'Amazon DynamoDB': 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html',
    'Amazon OpenSearch Service': 'https://docs.aws.amazon.com/opensearch-service/latest/developerguide/what-is.html',
    'AWS Step Functions': 'https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html',
    'AWS CloudTrail': 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html',
    'Amazon CloudWatch': 'https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html',
    'Amazon Comprehend': 'https://docs.aws.amazon.com/comprehend/latest/dg/what-is.html',
    'Amazon Textract': 'https://docs.aws.amazon.com/textract/latest/dg/what-is.html',
    'Amazon Kinesis Data Streams': 'https://docs.aws.amazon.com/streams/latest/dev/introduction.html',
    'AWS KMS': 'https://docs.aws.amazon.com/kms/latest/developerguide/overview.html',
    'AWS Secrets Manager': 'https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html',
    'Amazon API Gateway': 'https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html',
    'Amazon SageMaker': 'https://docs.aws.amazon.com/sagemaker/latest/dg/whatis.html',
    'Amazon Q Developer': 'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/what-is.html',
    'Amazon Q Business': 'https://docs.aws.amazon.com/amazonq/latest/qbusiness-ug/what-is.html',
    'Amazon EventBridge': 'https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html',
    'Amazon S3': 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html',
}


def needs_translate(s: str) -> bool:
    return isinstance(s, str) and s.strip() != '' and not JP_RE.search(s)


def load_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    return default


def save_json(path: Path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')


def infer_ref(text: str):
    for k, u in SERVICE_DOCS.items():
        if k.lower() in text.lower():
            return {'label': f'{k} 公式ドキュメント', 'url': u}
    return {'label': 'AWS 公式ドキュメント（Generative AI）', 'url': 'https://aws.amazon.com/generative-ai/'}


def _translate_one(s, translator):
    if len(s) <= 900:
        return translator.translate(s)
    # split long text to avoid API hangs
    parts = re.split(r'(?<=[\.\!\?])\s+|\n+', s)
    chunks, cur = [], ''
    for p in parts:
        if not p:
            continue
        if len(cur) + len(p) + 1 <= 700:
            cur = (cur + ' ' + p).strip()
        else:
            if cur:
                chunks.append(cur)
            cur = p
    if cur:
        chunks.append(cur)
    out = []
    for c in chunks:
        for attempt in range(3):
            try:
                out.append(translator.translate(c))
                break
            except Exception:
                time.sleep(0.6 * (attempt + 1))
        else:
            out.append(c)
    return ' '.join(out)


def translate_batch(texts, translator, cache):
    out = []
    pending = []
    for i, s in enumerate(texts):
        if not needs_translate(s):
            out.append(s)
            continue
        if s in cache:
            out.append(cache[s])
            continue
        out.append(None)
        pending.append(s)

    # very long strings are translated one-by-one first
    long_items = [s for s in pending if len(s) > 1200]
    for s in long_items:
        try:
            cache[s] = _translate_one(s, translator)
        except Exception:
            cache[s] = s

    pending = [s for s in pending if s not in cache]
    bs = 10
    for i in range(0, len(pending), bs):
        chunk = pending[i:i+bs]
        translated = None
        for attempt in range(4):
            try:
                translated = translator.translate_batch(chunk)
                if not isinstance(translated, list):
                    translated = [translated]
                if len(translated) != len(chunk):
                    raise RuntimeError('batch size mismatch')
                break
            except Exception:
                time.sleep(0.8 * (attempt + 1))
        if translated is None:
            translated = []
            for s in chunk:
                try:
                    translated.append(_translate_one(s, translator))
                except Exception:
                    translated.append(s)
        for src, tgt in zip(chunk, translated):
            cache[src] = tgt

    for i, s in enumerate(texts):
        if out[i] is None:
            out[i] = cache.get(s, s)
    return out


def process_test(test_index: int):
    data = load_json(DATA, {})
    cache = load_json(CACHE, {})
    tests = data.get('tests', [])
    if test_index < 0 or test_index >= len(tests):
        raise SystemExit(f'invalid test index: {test_index}')

    t = tests[test_index]
    translator = GoogleTranslator(source='en', target='ja')

    if needs_translate(t.get('title', '')):
        t['title'] = translate_batch([t['title']], translator, cache)[0]
    if needs_translate(t.get('description', '')):
        t['description'] = translate_batch([t['description']], translator, cache)[0]

    for qi, q in enumerate(t.get('questions', []), start=1):
        q['question'] = translate_batch([q.get('question', '')], translator, cache)[0]
        q['options'] = translate_batch(q.get('options', []), translator, cache)
        exp_src = q.get('explain', '')
        if isinstance(exp_src, str) and len(exp_src) > 700 and not JP_RE.search(exp_src):
            short = exp_src[:500]
            q['explain'] = translate_batch([short], translator, cache)[0] + '（詳細は参照リンクを確認してください）'
        else:
            q['explain'] = translate_batch([exp_src], translator, cache)[0]

        why = q.get('whyWrong') or []
        if len(why) < len(q['options']):
            why = why + [''] * (len(q['options']) - len(why))
        why = why[:len(q['options'])]
        for i, opt in enumerate(q['options']):
            if i == q.get('answer', 0):
                if not why[i]:
                    why[i] = ''
            else:
                if not why[i].strip():
                    why[i] = f'この選択肢（{opt}）は、問題文の要件やAWSの推奨構成に一致しないため不正解です。'
        q['whyWrong'] = translate_batch(why, translator, cache)

        refs = []
        for r in (q.get('refs') or []):
            url = r.get('url', '')
            if url:
                label = r.get('label', '参考資料')
                label = translate_batch([label], translator, cache)[0]
                refs.append({'label': label, 'url': url})
        if not refs:
            blob = ' '.join([q.get('question', '')] + q.get('options', []) + [q.get('explain', '')])
            refs = [infer_ref(blob)]
        q['refs'] = refs

        if qi % 1 == 0:
            save_json(CACHE, cache)
            save_json(DATA, data)
            if qi % 5 == 0:
                print(f'test {test_index+1}: {qi}/{len(t.get("questions", []))}')

    save_json(CACHE, cache)
    data['updatedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    save_json(DATA, data)
    print(f'done test {test_index+1}: {t.get("title","")} ({len(t.get("questions", []))} questions)')


if __name__ == '__main__':
    idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    process_test(idx)
