/**
 * Retry utility with exponential backoff for Supabase queries
 */

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  retryableErrors: [
    'PGRST002', // Schema cache error
    'PGRST503', // Service unavailable
    'BOOT_ERROR', // Edge function cold start failure
    '503',
    '502',
    '429', // Rate limit
    'FetchError',
    'NetworkError',
    'timeout',
    'Service Unavailable',
  ],
};

function isRetryableError(error: unknown, retryableErrors: string[]): boolean {
  if (!error) return false;
  
  const errorStr = String(error);
  const errorMessage = error instanceof Error ? error.message : '';
  const errorCode = (error as any)?.code || (error as any)?.status || '';
  
  return retryableErrors.some(code => 
    errorStr.includes(code) || 
    errorMessage.includes(code) || 
    String(errorCode).includes(code)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Execute a function with automatic retry on transient errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === opts.maxRetries) {
        console.error(`[Retry] Max retries (${opts.maxRetries}) exceeded`, error);
        throw error;
      }
      
      if (!isRetryableError(error, opts.retryableErrors)) {
        console.error('[Retry] Non-retryable error:', error);
        throw error;
      }
      
      const delay = calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
      console.log(`[Retry] Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Wrapper for Supabase query results that handles retries
 */
export async function retrySupabaseQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  options: RetryOptions = {}
): Promise<{ data: T | null; error: any }> {
  return withRetry(async () => {
    const result = await queryFn();
    
    // Check if the error is retryable
    if (result.error) {
      const opts = { ...DEFAULT_OPTIONS, ...options };
      if (isRetryableError(result.error, opts.retryableErrors)) {
        throw result.error; // Throw to trigger retry
      }
    }
    
    return result;
  }, options);
}

/**
 * Wrapper for Supabase Edge Function invocations with retry logic
 * Handles BOOT_ERROR and 503 transient failures from cold starts
 */
export async function retryEdgeFunction<T>(
  invokeFn: () => Promise<{ data: T | null; error: any }>,
  options: RetryOptions = {}
): Promise<{ data: T | null; error: any }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any = null;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await invokeFn();
      
      // Check if error is retryable (BOOT_ERROR, 503, etc.)
      if (result.error) {
        const errorStr = String(result.error?.message || result.error);
        const isRetryable = opts.retryableErrors.some(code => errorStr.includes(code));
        
        if (isRetryable && attempt < opts.maxRetries) {
          const delay = calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
          console.log(`[EdgeRetry] Attempt ${attempt + 1} failed (${errorStr}), retrying in ${Math.round(delay)}ms...`);
          lastError = result.error;
          await sleep(delay);
          continue;
        }
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      if (attempt === opts.maxRetries) {
        console.error(`[EdgeRetry] Max retries (${opts.maxRetries}) exceeded`, error);
        return { data: null, error };
      }
      
      if (!isRetryableError(error, opts.retryableErrors)) {
        console.error('[EdgeRetry] Non-retryable error:', error);
        return { data: null, error };
      }
      
      const delay = calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
      console.log(`[EdgeRetry] Attempt ${attempt + 1} threw error, retrying in ${Math.round(delay)}ms...`);
      await sleep(delay);
    }
  }
  
  return { data: null, error: lastError };
}
