<script setup lang="ts">
/**
 * AppLogo — MangoBI brand mark
 *
 * Round orange tile with a bold white "M" and an up-right growth arrow
 * exiting the right leg. Small notification-style dot at the upper-left;
 * subtle darker badge clipped to the lower-right edge for a touch of depth.
 */
withDefaults(defineProps<{
  /** size in px (height = width) */
  size?: number
  /** drop the soft outer shadow when sitting on an already-colored surface */
  flat?: boolean
}>(), { size: 64, flat: false })
</script>

<template>
  <svg
    :width="size" :height="size"
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="MangoBI"
    :class="flat ? '' : 'drop-shadow-md'"
  >
    <defs>
      <!-- Background: warm orange with a hint of glow from upper-left -->
      <radialGradient id="mb-tile" cx="0.32" cy="0.25" r="0.95">
        <stop offset="0%"   stop-color="#fdba74" />
        <stop offset="45%"  stop-color="#f97316" />
        <stop offset="100%" stop-color="#9a3412" />
      </radialGradient>
      <!-- Crisp circle clip so we can stroke the arrow OUTSIDE the disc -->
      <clipPath id="mb-clip">
        <circle cx="24" cy="24" r="22.5" />
      </clipPath>
    </defs>

    <!-- The disc -->
    <circle cx="24" cy="24" r="22.5" fill="url(#mb-tile)" />

    <!-- Small badge clipped to the lower-right edge for depth -->
    <g :clip-path="`url(#mb-clip)`">
      <rect x="34" y="34" width="14" height="14" rx="2.5" fill="#7c2d12" transform="rotate(45 41 41)" />
    </g>

    <!-- Decorative dot, upper-left -->
    <circle cx="11" cy="11" r="2.3" fill="white" />

    <!-- M + arrow: continuous heavy stroke, rounded joints -->
    <g
      stroke="white"
      stroke-width="6.5"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <!-- M body — left leg, V dip, right leg -->
      <polyline points="12,36 12,15 24,30 36,15 36,36" />
      <!-- Arrow stem out the top of the right leg, heading NE -->
      <line x1="36" y1="15" x2="44" y2="7" />
      <!-- Arrowhead chevron (tip at 44,7) -->
      <polyline points="39,7 44,7 44,12" />
    </g>
  </svg>
</template>
