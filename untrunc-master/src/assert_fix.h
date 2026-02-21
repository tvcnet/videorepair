/* Fix for macOS: re-apply custom assert after system headers override it.
   This file should be force-included via -include at the end of all headers. */
#ifndef ASSERT_FIX_H
#define ASSERT_FIX_H

#include "common.h"

/* Re-apply the custom assert macro (common.h defines assertt but system
   assert.h may have been included again by FFmpeg headers after common.h) */
#ifdef assert
#undef assert
#endif
#define assert assertt

#endif // ASSERT_FIX_H
