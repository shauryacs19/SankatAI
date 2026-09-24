// Motion presets for framer-motion. Transform + opacity only, durations and
// easings from the shared tokens. The app root wraps everything in
// <MotionConfig reducedMotion="user">, so framer drops transforms (keeping
// opacity) when the OS asks for reduced motion.

import { useReducedMotion as useFramerReducedMotion } from 'framer-motion'
import { motionTokens } from '@sankatai/shared'

const { duration: D, easing: E } = motionTokens
const s = (ms) => ms / 1000

// The one shared reduced-motion hook.
export const useReducedMotion = () => Boolean(useFramerReducedMotion())

export const pageEnter = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: s(200), ease: E.enter } },
}

export const listContainer = {
  initial: 'hidden',
  animate: 'show',
  variants: { hidden: {}, show: { transition: { staggerChildren: 0.035 } } },
}
export const listItem = {
  variants: {
    hidden: { opacity: 0, y: 4 },
    show: { opacity: 1, y: 0, transition: { duration: s(D.base), ease: E.enter } },
  },
  exit: { opacity: 0, transition: { duration: s(D.fast), ease: E.exit } },
}

export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: s(D.base), ease: E.enter } },
  exit: { opacity: 0, transition: { duration: s(D.fast), ease: E.exit } },
}

export const modalPanel = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1, transition: { duration: s(D.base), ease: E.enter } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: s(D.fast), ease: E.exit } },
}

export const sidePanel = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: { duration: s(D.slow), ease: E.enter } },
  exit: { opacity: 0, x: 24, transition: { duration: s(D.base), ease: E.exit } },
}

export const dropdown = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0, transition: { duration: s(D.fast), ease: E.enter } },
  exit: { opacity: 0, transition: { duration: s(D.fast), ease: E.exit } },
}

export const toastMotion = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: s(D.slow), ease: E.enter } },
  exit: { opacity: 0, y: 8, transition: { duration: s(D.base), ease: E.exit } },
}

export const messageEnter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: s(D.base), ease: E.enter } },
  exit: { opacity: 0, transition: { duration: s(D.fast), ease: E.exit } },
}
