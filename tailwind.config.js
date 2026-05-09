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
                // Kairos brand palette
                navy: {
                    950: '#060F1F',
                    900: '#0B1526',
                    800: '#0F1E38',
                    700: '#162847',
                    600: '#1E3A5F',
                    500: '#2A5080',
                    400: '#3D6B9E',
                    300: '#6B93BC',
                    200: '#A4BFDA',
                    100: '#D4E2F0',
                    50:  '#EEF4FA',
                },
                amber: {
                    950: '#451A03',
                    900: '#78350F',
                    800: '#92400E',
                    700: '#B45309',
                    600: '#D97706',
                    500: '#E8962A',
                    400: '#F0AA4F',
                    300: '#FBC06F',
                    200: '#FDD89A',
                    100: '#FEF0C7',
                    50:  '#FFFBEB',
                },
                // Semantic aliases used in components
                primary:   '#0F1E38',
                accent:    '#E8962A',
                surface:   '#FFFFFF',
                bgApp:     '#F4F6FA',
                border:    '#E4E9F0',
            },
            fontFamily: {
                display: ['"Plus Jakarta Sans"', 'sans-serif'],
                sans:    ['Inter', 'sans-serif'],
            },
            boxShadow: {
                card:   '0 1px 3px 0 rgba(15,30,56,0.06), 0 1px 2px -1px rgba(15,30,56,0.04)',
                cardMd: '0 4px 12px 0 rgba(15,30,56,0.08), 0 2px 4px -2px rgba(15,30,56,0.05)',
                cardLg: '0 10px 30px -4px rgba(15,30,56,0.12), 0 4px 6px -4px rgba(15,30,56,0.06)',
            },
            animation: {
                'fade-in':  'fadeIn 0.2s ease-out',
                'slide-up': 'slideUp 0.25s ease-out',
            },
            keyframes: {
                fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
                slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
            },
        },
    },
    plugins: [],
}
