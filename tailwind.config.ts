import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{html,ts}', './node_modules/flowbite/**/*.js'],
  theme: {
    extend: {},
  },
  safelist: [],
} satisfies Config;
