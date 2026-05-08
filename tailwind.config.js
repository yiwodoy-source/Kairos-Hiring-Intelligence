/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./*.{js,ts,jsx,tsx}",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./services/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // Keep custom semantic colors separate from Tailwind's core
                // palettes. Overriding slate/blue/red globally caused dark mode
                // to mutate light surfaces and made login text unreadable.
                primary: 'var(--color-primary)',
                secondary: 'var(--bg-sidebar)',
                accent: 'var(--color-accent)',
                bgLight: 'var(--bg-main)',
                cyber: {
                    bg: 'var(--cyber-bg)',
                    card: 'var(--cyber-card)',
                    blue: 'var(--cyber-neon-blue)',
                    pink: 'var(--cyber-neon-pink)',
                    purple: 'var(--cyber-neon-purple)',
                    green: 'var(--cyber-neon-green)',
                    border: 'var(--cyber-border)',
                },
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
