---
title: 'TypeScript Type Annotations with Twoslash'
description: 'A demo of twoslash-powered TypeScript code snippets with hover types and error highlights'
pubDate: '2026-04-19'
---

Twoslash lets you render TypeScript code snippets with real compiler feedback — hover tooltips showing inferred types, and red squiggles for actual type errors.

## Type Inference Annotations

Hover over the variables below to see their inferred types:

```ts twoslash
interface User {
  id: number;
  name: string;
  email: string;
}

function getUser(): User {
  return { id: 1, name: 'Alice', email: 'alice@example.com' };
}

const user = getUser();
//    ^?

const userName = user.name;
//    ^?

const ids = [1, 2, 3].map(n => n * 2);
//    ^?
```

The `^?` annotations reveal what TypeScript infers for each binding — no guessing required.

## TypeScript Errors

Twoslash also surfaces real compiler errors inline:

```ts twoslash
// @errors: 2322 2339
interface Product {
  id: number;
  title: string;
  price: number;
}

const product: Product = {
  id: 'not-a-number',
  title: 'Widget',
  price: 9.99,
};

console.log(product.rating);
```

The red squiggles come from the actual TypeScript compiler — the same errors you'd see in your IDE.
