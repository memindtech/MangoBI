<script setup lang="ts">
/**
 * AppLogo — MangoBI brand mark
 *
 * White M + growth-arrow paths come straight from the master vector
 * (D:\Resource Store\Images\Logo Mango Bi.svg). We just place them on
 * top of an orange disc background here so the component is self-contained.
 */
withDefaults(defineProps<{
  /** size in px (height = width) */
  size?: number
  /** drop the soft outer shadow when the logo sits on an already-colored surface */
  flat?: boolean
}>(), { size: 64, flat: false })
</script>

<template>
  <svg
    :width="size" :height="size"
    viewBox="0 0 80 80"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="MangoBI"
    :class="flat ? '' : 'drop-shadow-md'"
  >
    <defs>
      <radialGradient id="mb-tile" cx="0.32" cy="0.25" r="0.95">
        <stop offset="0%"   stop-color="#fdba74" />
        <stop offset="45%"  stop-color="#f97316" />
        <stop offset="100%" stop-color="#9a3412" />
      </radialGradient>
    </defs>

    <!-- Orange disc background -->
    <circle cx="40" cy="40" r="38" fill="url(#mb-tile)" />

    <!-- Master M+arrow paths (from Logo Mango Bi.svg).
         Scaled 0.78 and translated to sit centered on the disc. -->
    <g transform="translate(14.5 18) scale(0.78)" fill="white" stroke="white">
      <path d="M43.5 39.2047L52.5 25.2047V57.2047H43.5V39.2047Z" />
      <path d="M4.5 57.2047V14.2047H13L28.5 37.7047L46 12.7047L39.5 7.70474L59.5 0.704741V22.2047L53.5 17.7047L31 50.7047H26L14 32.2047V57.2047H4.5Z" />
    </g>
  </svg>
</template>
