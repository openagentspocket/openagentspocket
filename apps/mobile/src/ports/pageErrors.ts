/** NSURLErrorCancelled, which WebKit reports when a newer navigation replaced the load. */
const NS_URL_ERROR_CANCELLED = -999;
/** WebKitErrorFrameLoadInterruptedByPolicyChange: the navigation policy cancelled it (a redirect, a download). */
const WEBKIT_FRAME_LOAD_INTERRUPTED = 102;

/** A load that ended because something else took over says nothing about the Host or the tunnel. */
export function isCancelledLoad(code: number, domain?: string): boolean {
  return (
    code === NS_URL_ERROR_CANCELLED ||
    (domain === 'WebKitErrorDomain' && code === WEBKIT_FRAME_LOAD_INTERRUPTED)
  );
}
