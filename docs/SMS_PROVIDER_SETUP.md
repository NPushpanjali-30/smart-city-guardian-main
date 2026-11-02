# SMS Provider Architecture & Setup Guide

## 1. Provider Abstraction Contract (`ISmsProvider`)
All telecom SMS adapters in SmartCity Guardian implement the uniform `ISmsProvider` interface:

```typescript
export interface ISmsProvider {
  readonly name: string;
  readonly isLive: boolean;
  sendSms(params: SmsSendParams): Promise<SmsDeliveryResult>;
  getDeliveryStatus(messageId: string): Promise<SmsDeliveryStatus>;
  isAvailable(): boolean;
}
```

This abstraction ensures that the backend notification engine remains decoupled from external vendor SDKs and telecom carrier quirks.

---

## 2. Deterministic Mock Provider (`MockSmsProvider`)
The `MockSmsProvider` is the default provider in local, test, and staging environments. It provides deterministic behavior with zero external API calls:

- **Deterministic ID Generation**: `SM_mock_${timestamp}_${counter}`
- **Simulation Modes**:
  1. `SUCCESS`: Returns `DELIVERED`, computes exact GSM-7 or UCS-2 segment count, and stores dispatched record.
  2. `TRANSIENT_FAILURE`: Simulates carrier gateway timeouts (HTTP 503) to trigger queue retry worker backoff.
  3. `PERMANENT_FAILURE`: Simulates unallocated/invalid recipient phone numbers, marking records as `FAILED` immediately without wasteful retries.
  4. `RATE_LIMITED`: Simulates telecom carrier throughput limits (HTTP 429).

### Dynamic Simulation Mode Switching
Operators and integration tests can switch simulation modes dynamically via REST API:
```http
POST /api/v1/alerts/provider/simulation-mode
Content-Type: application/json

{
  "mode": "TRANSIENT_FAILURE"
}
```

---

## 3. Production Twilio Adapter (`TwilioSmsAdapter`)
The `TwilioSmsAdapter` connects to the Twilio REST API (`https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json`).

### Configuration Variables (`.env`)
To enable live SMS delivery, configure the following environment variables in `apps/api/.env`:

```env
# Twilio Production Credentials
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+18005550199
```

### Non-Crashing Graceful Fallback
If any Twilio credentials are missing or unconfigured:
- `adapter.isAvailable()` evaluates to `false`.
- Calls to `sendSms()` reject gracefully with error code `TWILIO_NOT_CONFIGURED` without throwing unhandled exceptions or crashing the API process.
- The system automatically logs an operational warning and preserves audit history.

---

## 4. Asynchronous Queue & Exponential Backoff Delivery Worker
The `NotificationQueueService` processes all outbound alerts through an asynchronous non-blocking worker:

1. **Queue Ingestion**:
   - The caller receives immediate HTTP acknowledgement with the assigned `recordId` and status `QUEUED`.
   - The worker executes `processQueue()` in the event loop background.
2. **Failure Classification & Exponential Backoff**:
   - **Permanent Errors** (e.g., `invalid recipient`, `unallocated number`): Immediately marked as `FAILED`.
   - **Transient Errors** (e.g., carrier timeout, rate limit): Rescheduled with exponential backoff:
     $$\text{backoffMs} = \min(100 \times 2^{\text{retryCount}}, 2000)$$
   - Up to **3 retry attempts** are executed before final dead-letter transition to `FAILED`.
3. **Manual Administrative Retry**:
   - Operations teams can trigger manual retries on failed notifications:
   ```http
   POST /api/v1/alerts/retry/:id
   ```

---

## 5. Delivery Health & Metrics Endpoint
Real-time provider performance and queue health can be queried at `GET /api/v1/alerts/health` or `GET /api/v1/admin/notifications/health`:

```json
{
  "status": "ok",
  "data": {
    "activeProvider": "mock-sms-provider",
    "providerIsLive": false,
    "providerAvailable": true,
    "queueDepth": 0,
    "totalDispatched": 14,
    "deliveredCount": 12,
    "sentToProviderCount": 0,
    "failedCount": 1,
    "suppressedCount": 1,
    "deliverySuccessRatePercent": 85.7,
    "policyMetrics": {
      "evaluationsCount": 16,
      "eligibleCount": 14,
      "suppressionCount": 1,
      "escalationBypassCount": 1
    }
  }
}
```
