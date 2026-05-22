---
name: guard-clauses
description: "Applies the Guard Clauses & Early Return pattern to eliminate deeply nested conditionals, reduce cognitive complexity, and improve code readability. Use this skill when writing or refactoring functions that have multiple if/else branches or complex validation logic."
user-invocable: true
risk: safe
---

# Guard Clauses & Early Return Skill

This skill applies the Guard Clause pattern - a technique to handle preconditions, validations, and edge cases at the top of a function using early returns, so the happy path remains flat, clean, and easy to read.

## Core Philosophy

> "Failing fast and returning early removes the need for else. The main flow of a function should be its least-indented code." - Martin Fowler

Guard clauses validate assumptions upfront. If a condition is not met, exit immediately. This keeps the core logic unobstructed and eliminates the arrow anti-pattern caused by deeply nested if/else blocks.

## When to Use

Apply this skill when:
- A function has multiple levels of if/else nesting.
- You find yourself writing else after a return, throw, or continue.
- Validation or precondition logic is buried inside branches.
- The happy path logic is hard to find due to indentation.
- Reviewing or refactoring code with high cognitive complexity.

## 1. The Core Pattern

Before - deeply nested (Arrow Anti-Pattern):
```python
def process_order(order):
    if order is not None:
        if order.is_paid():
            if order.has_items():
                if order.user.is_active():
                    ship_order(order)
                else:
                    raise ValueError("Inactive user")
            else:
                raise ValueError("No items")
        else:
            raise ValueError("Order not paid")
    else:
        raise ValueError("Order is null")
```

After - guard clauses with early return:
```python
def process_order(order):
    if order is None:
        raise ValueError("Order is null")
    if not order.is_paid():
        raise ValueError("Order not paid")
    if not order.has_items():
        raise ValueError("No items")
    if not order.user.is_active():
        raise ValueError("Inactive user")

    ship_order(order)
```

The happy path (ship_order) is now immediately visible at the bottom, unindented.

## 2. Rules to Follow

### Rule 1 - Never write else after a terminal statement
If a branch ends with return, throw, raise, continue, or break, remove the else. The code after the block is already the implicit else.

```typescript
// Avoid
function getDiscount(user: User): number {
  if (user.isPremium()) {
    return 0.2;
  } else {
    return 0.0;
  }
}

// Prefer
function getDiscount(user: User): number {
  if (user.isPremium()) return 0.2;
  return 0.0;
}
```

### Rule 2 - Invert the condition to guard

Instead of if (valid) { do work }, write if (invalid) { exit early }.

```javascript
// Avoid
function sendEmail(user) {
  if (user.isVerified) {
    if (user.email) {
      mailer.send(user.email);
    }
  }
}

// Prefer
function sendEmail(user) {
  if (!user.isVerified) return;
  if (!user.email) return;
  mailer.send(user.email);
}
```

### Rule 3 - Keep the happy path at the lowest indentation level

The main logic of a function should not be nested. Guards live at the top; the core logic lives at the bottom.

### Rule 4 - One guard per condition

Each guard clause should check a single condition. Avoid combining unrelated guards with && or || into one if statement if they represent distinct rules.

```python
# Avoid (mixing unrelated concerns)
if user is None or not user.is_active() or order is None:
    return

# Prefer (distinct, readable guards)
if user is None:
    raise ValueError("User required")
if not user.is_active():
    raise ValueError("User must be active")
if order is None:
    raise ValueError("Order required")
```

### Rule 5 - Prefer throw/raise over silent return when the state is invalid

A silent return can hide bugs. Use meaningful exceptions or error objects when the guard condition represents an invalid state, not just an optional path.

```typescript
// Avoid - silently exits, caller won't know why
function processPayment(payment: Payment | null) {
  if (!payment) return;
  charge(payment);
}

// Prefer - explicit failure with context
function processPayment(payment: Payment | null) {
  if (!payment) throw new Error("Payment object is required");
  charge(payment);
}
```

## 3. Loops - Use continue as a Guard

Inside loops, use continue to skip iterations instead of nesting logic inside if blocks.

```python
# Avoid
for item in items:
    if item.is_active():
        if item.stock > 0:
            process(item)

# Prefer
for item in items:
    if not item.is_active():
        continue
    if item.stock == 0:
        continue
    process(item)
```

## 4. Multi-Language Examples

### JavaScript / TypeScript
```typescript
function createUser(data: UserInput): User {
  if (!data.name) throw new Error("Name is required");
  if (!data.email) throw new Error("Email is required");
  if (!isValidEmail(data.email)) throw new Error("Email format invalid");
  if (data.age < 18) throw new Error("Must be 18 or older");

  return new User(data);
}
```

### Python
```python
def withdraw(account, amount):
    if account is None:
        raise ValueError("Account not found")
    if amount <= 0:
        raise ValueError("Amount must be positive")
    if account.balance < amount:
        raise ValueError("Insufficient funds")

    account.balance -= amount
    return account.balance
```

### Java
```java
public void cancelOrder(Order order) {
    if (order == null) throw new IllegalArgumentException("Order is null");
    if (order.isCancelled()) throw new IllegalStateException("Already cancelled");
    if (!order.isCancellable()) throw new IllegalStateException("Order cannot be cancelled");

    order.cancel();
    notifyUser(order.getUser());
}
```

### Go (idiomatic early return on error)
```go
func processFile(path string) ([]byte, error) {
    if path == "" {
        return nil, errors.New("path cannot be empty")
    }
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("reading file: %w", err)
    }
    if len(data) == 0 {
        return nil, errors.New("file is empty")
    }
    return parse(data)
}
```

## 5. When NOT to Use Early Return

- Tiny functions with a single if/else: Early return adds no clarity when there are only two short branches.
- When both branches carry equal weight: If the if and else blocks are equally important, consider keeping both explicit rather than inverting one.
- When it obscures intent: Sometimes a clear if (isValid) { doWork() } is more readable than an inverted guard.

Use judgment. The goal is clarity, not a mechanical enforcement of early returns.

## Refactoring Checklist

When reviewing or refactoring a function, ask:

- Is there an else after a return, throw, or raise? Remove the else.
- Is the happy path buried inside 2+ levels of nesting? Add guard clauses at the top.
- Are there silent return statements hiding invalid states? Replace with exceptions.
- Are guards combining multiple unrelated conditions? Split into individual guards.
- In loops, is logic nested inside if (valid) blocks? Use continue guards instead.
- Is each guard clause explaining why it exits via message or exception type?

## References

- Martin Fowler - Refactoring: Improving the Design of Existing Code, "Replace Nested Conditional with Guard Clauses"
- Robert C. Martin - Clean Code, Chapter 3: Functions
- Refactoring.guru - Replace Nested Conditional with Guard Clauses