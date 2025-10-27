// --- FIX: Add type definitions for global libraries ---
// These are for libraries like jsPDF and html2canvas that are loaded via script tags
// and attach themselves to the window object.
declare global {
    interface Window {
        jspdf: {
            jsPDF: new (options?: any) => any;
        };
        html2canvas: (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>;
    }
}

// --- 0. IMPORTS & LIBRARIES (from firebase) ---
import { initializeApp } from "firebase/app";
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    GoogleAuthProvider, 
    FacebookAuthProvider, 
    signInWithPopup,
    User as FirebaseUser
} from 'firebase/auth';
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    arrayUnion, 
    serverTimestamp 
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from "firebase/functions";

// --- TYPE DEFINITIONS ---
// Replicating types.ts for a self-contained file
type NameMode = 'brand' | 'baby' | 'personal' | 'compatibility';
type Currency = 'USD' | 'INR';
type AnalysisGoal = 'General Insight' | 'Career Growth' | 'Relationships' | 'Personal Confidence' | 'Finding my Path';
type ViewState = 'idle' | 'loading' | 'results' | 'error' | 'blog' | 'blogPost' | 'adminLogin' | 'adminDashboard' | 'dashboard';

interface BreakdownScores {
  life_path: number; destiny: number; soul_urge: number; personality: number;
}
interface CoreNumbers {
  lifePathNumber: number; destinyNumber: number; soulUrgeNumber: number; personalityNumber: number;
}
interface NameSuggestion {
  suggested_name: string; reason: string; new_score: number;
}
interface NameAnalysisResult {
  score: number; breakdown: BreakdownScores; short_rationale: string; positive_traits: string[]; challenges: string[]; coreNumbers: CoreNumbers; suggestions: NameSuggestion[]; holistic_rationale?: string;
}
interface CompatibilityAnalysisResult {
  score: number; title: string; names: [string, string]; strengths: string; challenges: string; summary: string;
}
type BadgeId = | 'first_step' | 'curious_explorer' | 'numerology_novice' | 'high_achiever' | 'perfect_harmony' | 'dynamic_duo' | 'consistent_seeker' | 'weekly_wisdom';
interface Badge { id: BadgeId; name: string; description: string; icon: (className?: string) => string; }
interface UserProgress { analysesCompleted: number; compatibilityAnalyses: number; lastCheckin: string | null; currentStreak: number; highScore: number; unlockedBadgeIds: BadgeId[]; }
interface BlogPost { slug: string; title: string; author: string; date: string; image: string; excerpt: string; content: string; }
interface AnalysisHistoryItem { id: string; name: string; score: number; date: string; goal: AnalysisGoal; mode: NameMode; }
type CurrentUser = { uid: string; name: string; email: string; history: AnalysisHistoryItem[]; coreNumbers?: CoreNumbers; };
type AuthModalState = 'login' | 'signup' | 'hidden';
interface DashboardStats {
    totalRevenue: { usd: number; inr: number }; totalAnalyses: number; reportsSold: number; bundlesSold: number; conversionRate: number; averageScore: number;
}


// --- 1. CONFIGURATION & INITIALIZATION ---

const firebaseConfig = {
    apiKey: "AIzaSyDuTG396wwL1RzPz3KKyHhDrc1NsFU84JQ",
    authDomain: "namescore-78e17.firebaseapp.com",
    projectId: "namescore-78e17",
    storageBucket: "namescore-78e17.appspot.com",
    messagingSenderId: "340649889556",
    appId: "1:340649889556:web:db5d6def203030406f3c01",
    measurementId: "G-FGECR3NQ5N"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// Callable function references
const analyzeNameCallable = httpsCallable(functions, 'analyzeName');
const analyzeCompatibilityCallable = httpsCallable(functions, 'analyzeCompatibility');
const getDailyInsightCallable = httpsCallable(functions, 'getDailyInsight');

// --- CONSTANTS ---
const PRICING_DATA = {
    USD: { report: 9, bundle: 29 },
    INR: { report: 499, bundle: 1499 },
};
const currencySymbols = { USD: '$', INR: '₹' };
const analysisGoals: AnalysisGoal[] = [
    'General Insight', 'Career Growth', 'Relationships', 'Personal Confidence', 'Finding my Path'
];

// --- 2. STATE MANAGEMENT ---

let state = {
  view: 'idle' as ViewState,
  analysis: null as NameAnalysisResult | null,
  compatibilityAnalysis: null as CompatibilityAnalysisResult | null,
  error: null as string | null,
  currentName: '',
  currentName2: '',
  ogImageUrl: null as string | null,
  currency: 'USD' as Currency,
  currentBlogPost: null as BlogPost | null,
  isAdminLoggedIn: false,
  authLoading: true,
  isLoggedIn: false,
  currentUser: null as CurrentUser | null,
  userProgress: null as UserProgress | null,
  authModalState: 'hidden' as AuthModalState,
  isCheckoutOpen: false,
  checkoutData: null as any,
  toastQueue: [] as Badge[],
  adminStats: null as DashboardStats | null,
  adminData: {} as any, // For charts
  heroFormMode: 'personal' as NameMode,
};

function setState(newState: Partial<typeof state>) {
  state = { ...state, ...newState };
  renderApp();
}

// --- 3. ICON & COMPONENT TEMPLATE FUNCTIONS ---

// --- ICONS --- (Converted from React components to SVG string functions)
const LifePathIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>`;
const DestinyIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>`;
const SoulUrgeIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>`;
const PersonalityIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>`;
const LoadingSpinner = (className = 'h-10 w-10') => `<svg class="animate-spin ${className} text-[var(--color-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
const DocumentDownloadIcon = (className = 'h-5 w-5') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>`;
const HeartIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd" /></svg>`;
const ExclamationIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`;
const CheckmarkIcon = (className = 'h-5 w-5') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>`;
const SparklesIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>`;
const PadlockIcon = (className = 'h-5 w-5') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 2a4 4 0 00-4 4v2H4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2h-2V6a4 4 0 00-4-4zm2 6H8V6a2 2 0 114 0v2z" clip-rule="evenodd" /></svg>`;
const UserCircleIcon = (className = "h-6 w-6") => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
const BabyIcon = (className = "h-6 w-6") => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h.01M15 12h.01M12 18a2 2 0 01-2-2h4a2 2 0 01-2 2z"/><path d="M21.17 13.83A9.95 9.95 0 0012 3C6.48 3 2 7.48 2 13s4.48 10 10 10a9.95 9.95 0 009.17-5.17z"/></svg>`;
const KeyboardIcon = (className = "h-5 w-5") => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 17l4 4 4-4m-4-12v16" transform="rotate(180 12 12)" /><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M5 14h14M3 6h18a2 2 0 012 2v8a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2z" /></svg>`;
const KeyIcon = (className = "h-6 w-6") => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>`;
const CheckCircleIcon = (className = 'h-6 w-6 text-green-500') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
const XCircleIcon = (className = 'h-6 w-6 text-gray-400') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
const GoogleIcon = (className = 'h-5 w-5') => `<svg class="${className}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.228 0-9.655-3.449-11.303-8H6.306C9.656 39.663 16.318 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.018 35.533 44 30.023 44 24c0-1.341-.138-2.65-.389-3.917z"/></svg>`;
const FacebookIcon = (className = 'h-5 w-5') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" /></svg>`;
const BookOpenIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>`;
const FireIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7.014A8.003 8.003 0 0122 12c0 3.771-2.5 7-5 7a5 5 0 01-5-5c0 1.5-.5 4-2.343 5.657z" /><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 16.121A3 3 0 1014.12 11.88a3 3 0 00-4.242 4.242z" /></svg>`;
const TrophyIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z" transform="rotate(180 12 12)" /><path stroke-linecap="round" stroke-linejoin="round" d="M9 11l3-3m0 0l3 3m-3-3v8m0-13a9 9 0 110 18 9 9 0 010-18z" /><path stroke-linecap="round" stroke-linejoin="round" d="M17 8h2a2 2 0 012 2v2a2 2 0 01-2 2h-2m-1-4v4m-6 4H7a2 2 0 01-2-2v-2a2 2 0 012-2h2m-1 4v-4" /></svg>`;
const LightbulbIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.636-6.364l.707.707M17.663 17h.673c2.21 0 4-1.79 4-4a4 4 0 00-4-4H6.337c-2.21 0-4 1.79-4 4a4 4 0 004 4h.673M12 5.5A2.5 2.5 0 0114.5 8v4a2.5 2.5 0 01-5 0V8A2.5 2.5 0 0112 5.5z" /></svg>`;
const BriefcaseIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>`;
const NewspaperIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 12h6M7 8h6" /></svg>`;
const SunIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>`;
const UsersIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-4.663M12 3.375c-3.418 0-6.162 2.744-6.162 6.162s2.744 6.162 6.162 6.162 6.162-2.744 6.162-6.162S15.418 3.375 12 3.375z"></path></svg>`;
const FootstepsIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>`;
const MedalIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3.465l1.623 5.011h5.362l-4.32 3.14 1.624 5.011L12 13.48l-4.32 3.147 1.624-5.011-4.32-3.14h5.362L9 3.465z" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" /></svg>`;
const TargetIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" /><path stroke-linecap="round" stroke-linejoin="round" d="M9 12a3 3 0 106 0 3 3 0 00-6 0z" /></svg>`;
const LayersIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>`;
const CompassIcon = (className = 'h-6 w-6') => `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" /><path stroke-linecap="round" stroke-linejoin="round" d="M9 12a3 3 0 106 0 3 3 0 00-6 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" /></svg>`;

// --- COMPONENT TEMPLATES ---

// ... (All other component templates will be defined here) ...

// --- 4. SERVICES (API, Data, Logic) ---

// --- BLOG SERVICE (Mock Data) ---
const BLOG_POSTS: BlogPost[] = [
    {
        slug: 'the-power-of-your-destiny-number',
        title: "The Power of Your Destiny Number: A Guide to Your Life's Purpose",
        author: 'Dr. Evelyn Reed',
        date: '2024-07-15T10:00:00Z',
        image: 'https://images.unsplash.com/photo-1505506874110-6a7a69069a08?q=80&w=2370&auto=format&fit=crop',
        excerpt: 'Your Destiny Number, derived from your full birth name, reveals the mission you are meant to fulfill. It’s the compass pointing towards your true potential. Learn how to calculate and interpret it.',
        content: `
<p>In the intricate tapestry of numerology, a set of core numbers serves as the blueprint for your existence, outlining your personality, challenges, and ultimate potential. Among these, the <strong>Destiny Number</strong> (also known as the Expression Number) holds a place of profound significance. Calculated from the letters of your full birth name, this number is a vibrant, energetic signature that reveals your life's purpose and the unique talents you possess to achieve it. It is the spiritual mission statement you were born with, a celestial compass pointing toward your highest potential. Understanding your Destiny Number is like being handed a map to a hidden treasure—the treasure of your own authentic self. It illuminates the skills you were born with, guides your choices, and helps you build a life that is not just successful, but deeply fulfilling.</p>
<h2>How to Calculate Your Destiny Number: A Step-by-Step Guide</h2>
<p>The calculation of your Destiny Number is an ancient practice rooted in the Pythagorean system, which assigns a numerical value to each letter of the alphabet. This process is straightforward but reveals profound truths. It involves summing the values of all the letters in your full birth name and then reducing that total to a single digit or a Master Number (11, 22, or 33).</p>
<p><strong>The Pythagorean Letter-Value Chart:</strong></p>
<ul>
    <li><strong>1:</strong> A, J, S</li>
    <li><strong>2:</strong> B, K, T</li>
    <li><strong>3:</strong> C, L, U</li>
    <li><strong>4:</strong> D, M, V</li>
    <li><strong>5:</strong> E, N, W</li>
    <li><strong>6:</strong> F, O, X</li>
    <li><strong>7:</strong> G, P, Y</li>
    <li><strong>8:</strong> H, Q, Z</li>
    <li><strong>9:</strong> I, R</li>
</ul>
<p><strong>Step 1: Write Down Your Full Birth Name.</strong> It is crucial to use the exact name as it appears on your birth certificate, including all middle names. This name holds the original vibrational frequency you carried into this world.</p>
<p><strong>Step 2: Assign a Number to Each Letter.</strong> Using the chart above, write the corresponding number below each letter of your name.</p>
<p><strong>Step 3: Sum the Numbers for Each Name.</strong> Add up the numbers for your first, middle, and last names separately to keep the calculation organized.</p>
<p><strong>Step 4: Calculate the Grand Total.</strong> Add the sums of each name together to get a final total.</p>
<p><strong>Step 5: Reduce to a Single Digit or Master Number.</strong> If your total is a two-digit number (and not 11, 22, or 33), add those digits together. Continue this reduction process until you arrive at a single digit or one of the three Master Numbers.</p>
<p><strong>An Example Calculation:</strong> Let's take the name <strong>MARIE ANNE CURIE</strong>.</p>
<p>MARIE: 4 + 1 + 9 + 9 + 5 = 28<br>ANNE: 1 + 5 + 5 + 5 = 16<br>CURIE: 3 + 3 + 9 + 9 + 5 = 29</p>
<p>Total Sum = 28 + 16 + 29 = 73<br>Reduce: 7 + 3 = 10<br>Reduce again: 1 + 0 = 1</p>
<p>Thus, Marie Anne Curie has a powerful Destiny Number of <strong>1</strong>, reflecting her pioneering spirit and leadership in the world of science.</p>
<h2>Interpreting Your Destiny Number (1-9)</h2>
<p>Each number from 1 to 9 carries a unique set of energies, talents, and challenges. Discover what your number says about your life's work.</p>
<ul>
    <li><strong>Destiny Number 1: The Pioneer.</strong> Your mission is to lead, innovate, and establish your independence. You are a natural-born leader, courageous and determined, meant to forge new paths and inspire others with your originality. Your life is a journey of developing self-reliance and confidence. The challenge for a 1 is to temper their drive with humility and learn to collaborate without sacrificing their unique vision.</li>
    <li><strong>Destiny Number 2: The Peacemaker.</strong> You are destined to create harmony, foster cooperation, and serve as a mediator. You possess immense sensitivity, intuition, and a gift for diplomacy, making you a supportive partner and a loyal friend. Your path is about building bridges and nurturing relationships. The challenge for a 2 is to develop self-confidence and learn to assert your needs without fear of conflict.</li>
    <li><strong>Destiny Number 3: The Communicator.</strong> Your purpose is to inspire, uplift, and bring joy to the world through your creative self-expression. You are a gifted artist, writer, or speaker with a vibrant imagination and a charismatic personality. Your journey is about sharing your unique voice. The challenge for a 3 is to maintain focus and discipline, channeling your abundant creative energy toward meaningful projects.</li>
    <li><strong>Destiny Number 4: The Builder.</strong> Your destiny is to create tangible, lasting value through discipline, hard work, and meticulous planning. You are the bedrock of society—reliable, pragmatic, and dedicated. Your mission is to build secure foundations for yourself and others. The challenge for a 4 is to embrace flexibility and avoid becoming too rigid or dogmatic in your approach.</li>
    <li><strong>Destiny Number 5: The Adventurer.</strong> Your path is one of freedom, change, and experiencing life to the fullest. You are a versatile, adaptable, and curious soul who thrives on new experiences, travel, and social connection. Your mission is to embrace change and inspire others to live more freely. The challenge for a 5 is to learn self-discipline and find a constructive use for your freedom, avoiding restlessness and overindulgence.</li>
    <li><strong>Destiny Number 6: The Nurturer.</strong> You are destined to serve others with love, compassion, and a strong sense of responsibility. You are a natural caregiver, focused on family, home, and community. Your purpose is to create beauty, harmony, and healing. The challenge for a 6 is to find a healthy balance between caring for others and meeting your own needs, avoiding self-righteousness or meddling.</li>
    <li><strong>Destiny Number 7: The Seeker.</strong> Your journey is an inward one, focused on acquiring knowledge, wisdom, and spiritual insight. You are a deep thinker, an analyst, and a philosopher with a powerful intuition. Your mission is to uncover life's deeper truths. The challenge for a 7 is to trust your intuition, share your wisdom, and avoid becoming too isolated, skeptical, or emotionally distant.</li>
    <li><strong>Destiny Number 8: The Powerhouse.</strong> Your destiny is to achieve mastery in the material world, demonstrating authority, financial acumen, and organizational skill. You are a natural executive with the ambition and resilience to achieve great success. Your purpose is to use your power and resources for the greater good. The challenge for an 8 is to cultivate a healthy relationship with money and power, avoiding greed or a domineering attitude.</li>
    <li><strong>Destiny Number 9: The Humanitarian.</strong> You are here to serve humanity on a grand scale, driven by compassion, idealism, and wisdom. You possess a broad perspective and a deep, unconditional love for others. Your mission is to inspire, teach, and make the world a better place. The challenge for a 9 is to learn to let go of past hurts and to give selflessly without expecting anything in return.</li>
</ul>
<h2>The Master Numbers: A Path of Higher Potential</h2>
<p>Master Numbers (11, 22, and 33) indicate a destiny with a higher potential for achievement and spiritual impact, but they also bring more intense challenges and a greater sense of responsibility.</p>
<ul>
    <li><strong>Destiny Number 11: The Visionary (11/2).</strong> You are a spiritual messenger, destined to inspire humanity through your profound intuition and visionary ideas. You carry the qualities of the number 2 (cooperation, harmony) but elevated to a spiritual plane. The challenge is to ground your heavenly insights in the practical world and manage the nervous tension that comes with such high sensitivity.</li>
    <li><strong>Destiny Number 22: The Master Builder (22/4).</strong> This is the most powerful number, capable of turning grand dreams into concrete reality. You are destined to create systems, businesses, or institutions that have a lasting, positive impact on the world. You have the practicality of the 4, magnified to its highest potential. The challenge is to handle the immense pressure and responsibility of your mission without being overwhelmed.</li>
    <li><strong>Destiny Number 33: The Master Teacher (33/6).</strong> This rare and significant number represents the highest form of selfless service and healing. Your destiny is to be a source of love, compassion, and guidance for humanity. You embody the nurturing qualities of the 6, elevated to a global, spiritual level. The path of the 33 is demanding, requiring immense sacrifice and a deep commitment to helping others.</li>
</ul>
<h2>Living in Alignment with Your Destiny</h2>
<p>Discovering your Destiny Number is a powerful moment of self-recognition. To truly harness its power, you must consciously align your life with its vibrational energy. This means choosing careers, relationships, and lifestyles that support your innate talents and purpose. A Destiny 5 would feel suffocated in a predictable, routine job, while a Destiny 4 would thrive. A Destiny 9 would feel unfulfilled if not engaged in some form of service. By embracing the strengths of your Destiny Number and mindfully working on its inherent challenges, you unlock a life of flow, purpose, and profound fulfillment. Your name is not just a label; it's a lifelong guide to becoming the magnificent person you were always destined to be.</p>
`,
    },
    {
        slug: '5-mistakes-choosing-a-brand-name',
        title: '5 Common Mistakes to Avoid When Choosing a Brand Name',
        author: 'Marcus Vance',
        date: '2024-07-10T14:30:00Z',
        image: 'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?q=80&w=2370&auto=format&fit=crop',
        excerpt: 'A brand name is more than just a label; it’s an energetic signature. Avoid these five common numerological and phonetic pitfalls to ensure your brand vibrates with success.',
        content: `
<p>In the fiercely competitive landscape of modern business, a brand name is far more than a simple identifier. It is the cornerstone of your brand's identity, the first point of contact with your audience, and a powerful vessel for your company's story and values. While entrepreneurs rightly focus on practicalities like memorability, domain availability, and trademark clearance, they often overlook a more subtle yet potent factor: the name's energetic and vibrational quality. Through the lenses of numerology and phonetics, we can see that a name carries a subconscious power that can either attract success or create hidden friction. A brand name that is in vibrational alignment with your mission can act as a magnet for ideal customers and opportunities. Conversely, a misaligned name can feel inauthentic and hinder growth. To help you navigate this crucial decision, here are five common yet critical mistakes to avoid when choosing a name for your brand.</p>
<h2>Mistake #1: Ignoring the Numerological Vibration</h2>
<p>Every name, whether for a person or a business, resonates with a specific numerical vibration. In numerology, the <strong>Destiny (or Expression) Number</strong> of a brand name is calculated by converting its letters into numbers and reducing them to a single digit or Master Number. This number reveals the brand's inherent character and its likely path. A name that calculates to a stable, pragmatic <strong>4</strong> might be perfect for a financial institution or a construction company (e.g., "Bedrock Financial"), as it conveys security and reliability. However, that same energy would feel stifling for a cutting-edge tech startup, which would thrive under the innovative and pioneering energy of a <strong>1</strong> (e.g., "Apex Innovations"). A creative agency would align beautifully with the expressive and communicative vibration of a <strong>3</strong>, while a luxury travel brand would benefit from the adventurous and freedom-loving energy of a <strong>5</strong>.</p>
<p><strong>Actionable Tip:</strong> Before falling in love with a name, calculate its Destiny Number. Ask yourself: does this number's energy genuinely reflect our brand's core mission, values, and the feeling we want to evoke in our customers? Choosing a name without this analysis is like setting sail without a compass; you might eventually reach a destination, but it may not be the one you intended.</p>
<h2>Mistake #2: Overlooking Phonetic Power (Sound Symbolism)</h2>
<p>The sounds within a name have a direct and measurable impact on human perception—a field of study known as <strong>phonosemantics</strong> or sound symbolism. Certain sounds subconsciously evoke specific qualities. For example, hard consonants like 'k', 't', and 'g' (known as plosives) often feel sharp, precise, and strong. This makes them common in tech, automotive, and athletic brands (e.g., "Nike," "Intel," "Gatorade"). In contrast, soft, flowing sounds using vowels and sonorant consonants like 'l', 's', 'm', and 'r' can convey smoothness, elegance, and comfort, making them ideal for luxury, beauty, or wellness brands (e.g., "Lush," "Serena," "Aura").</p>
<p>Furthermore, a name that is difficult to pronounce or spell creates an immediate barrier. If potential customers stumble over your name, they are less likely to remember it, search for it online, or recommend it to others. This significantly hampers word-of-mouth marketing. Test your name ideas with a diverse group of people. Is the pronunciation intuitive? Does it sound appealing when spoken? The auditory experience of your brand is just as critical as its visual identity.</p>
<h2>Mistake #3: Choosing a Name That Restricts Growth</h2>
<p>A frequent pitfall for new businesses is selecting a name that is overly literal or geographically confined. "Seattle's Best Coffee" was a great name for a local coffee shop. As it grew into a national brand, the name became a limitation. "Carphone Warehouse" struggled to maintain relevance as mobile phones became just one part of a much larger tech ecosystem. When naming your business, think about your ten-year vision, not just your first year. Will this name still make sense if you expand your product line, serve a different market, or move into new geographical regions?</p>
<p>Consider names that are more evocative or abstract. "Amazon" was chosen because it suggested vastness and scale, allowing the company to grow from an online bookstore into the "everything store." "Apple" has nothing to do with computers, but it's simple, memorable, and has allowed the brand to expand into phones, music, and media seamlessly. A flexible name is an asset that grows with you.</p>
<h2>Mistake #4: Disregarding the Visual and Digital Form</h2>
<p>In our digital-first world, a brand name must work across a multitude of platforms. Before finalizing your choice, consider its visual and digital footprint. How does the name look in a logo? Some letter combinations are aesthetically pleasing, while others can be awkward or illegible. Type the name out in various fonts, in both uppercase (LOGO) and lowercase (logo). Is it visually balanced?</p>
<p>Equally important is its digital availability. Is the .com domain name available? Are the corresponding handles free on key social media platforms like Instagram, X (Twitter), Facebook, and TikTok? A fragmented digital identity, where your website is "BrandNameHQ.com" and your Instagram is "@TheRealBrandName," creates confusion and dilutes your brand's power. A consistent and professional online presence is non-negotiable for modern businesses.</p>
<h2>Mistake #5: Creating a Founder-Brand Energetic Mismatch</h2>
<p>This is a deeper, more nuanced concept from the world of business numerology. A brand is an energetic extension of its founder. When a brand name's numerology is in disharmony with the founder's own core numerological numbers (such as their Life Path or Destiny Number), it can create a subconscious energetic conflict. This might manifest as persistent challenges, slow growth, or a feeling of constantly "pushing a boulder uphill." The business may never feel truly authentic to the founder.</p>
<p>Conversely, when the brand name's vibration is in harmony with the founder's, it creates a powerful synergy. The business feels like a natural and authentic expression of the founder's purpose, leading to greater flow, creativity, and ease in attracting success. Your business should be your greatest ally. That alignment begins with a name that resonates not just with the market, but with you.</p>
<h2>Your Checklist for a Harmonious and Successful Brand Name</h2>
<ul>
    <li><strong>Numerological Alignment:</strong> Does the name's Destiny Number match your brand's mission and industry?</li>
    <li><strong>Phonetic Appeal:</strong> Is it easy to say, spell, and remember? Do its sounds evoke the right feelings?</li>
    <li><strong>Future-Proofing:</strong> Does the name allow for growth, expansion, and evolution?</li>
    <li><strong>Visual & Digital Identity:</strong> Does it look good as a logo? Is a clean, matching set of domains and social handles available?</li>
    <li><strong>Founder Harmony:</strong> Does the name feel authentically "you"? Consider a full compatibility analysis to ensure it aligns with your personal numerology.</li>
</ul>
<p>By thoughtfully considering these elements and avoiding these common mistakes, you can select a brand name that is not only strategic and marketable but also energetically aligned for profound and lasting success. It is one of the most important investments you will ever make in your business.</p>
`,
    },
    {
        slug: 'numerology-compatibility-guide',
        title: "Are You and Your Partner a Match? A Numerology Compatibility Guide",
        author: 'Sofia Chen',
        date: '2024-07-05T09:00:00Z',
        image: 'https://images.unsplash.com/photo-1554188248-986adbb73371?q=80&w=2370&auto=format&fit=crop',
        excerpt: "Numerology offers profound insights into relationship dynamics. By comparing the Life Path numbers of two people, we can uncover areas of natural harmony and potential friction.",
        content: `
<p>Why do we feel an instant, effortless connection with some people, while other relationships seem to require constant effort and navigation through choppy waters? The mystery of human connection is multifaceted, but numerology provides a uniquely insightful framework for understanding the energetic dynamics between two people. By comparing the core numbers in your numerology charts—most importantly, the <strong>Life Path number</strong>—you can create a "relationship blueprint" that highlights your natural harmonies, potential friction points, and shared purpose. This isn't about labeling a relationship as "good" or "bad." Rather, it's a powerful tool for self-awareness that fosters deeper compassion, enhances communication, and empowers you to consciously co-create a partnership that thrives.</p>
<h2>The Foundation: Your Life Path Number in Relationships</h2>
<p>Your Life Path number is the most significant number in your numerology chart. Calculated from the digits of your birth date (DD + MM + YYYY, reduced to a single digit or Master Number), it represents the main journey you are here to experience in this lifetime. It reveals your core personality, your innate talents, and the fundamental lessons your soul aims to learn. When two people come together, their Life Path numbers create a unique energetic chord. Some pairings are naturally harmonious, vibrating at frequencies that complement each other. Others can be dissonant, requiring more conscious effort to find a middle ground. Understanding this core dynamic is the first step to mastering the art of a conscious and loving relationship.</p>
<h2>The Compatibility Matrix: How Each Life Path Number Interacts</h2>
<p>Let's explore the general dynamics between each Life Path number. Remember, this is a guide to the energetic tendencies; free will and conscious effort can overcome any challenge.</p>
<h2>Life Path 1: The Independent Leader</h2>
<p>Ambitious and self-reliant, 1s need partners who respect their autonomy and support their innovative ideas.</p>
<ul>
    <li><strong>Most Compatible With: 3, 5.</strong> The creative 3 inspires the 1's vision, while the adventurous 5 shares the 1's love for excitement and freedom. These pairings are dynamic and full of life.</li>
    <li><strong>Potential Harmony With: 2, 6.</strong> The supportive 2 provides the emotional balance the 1 needs, while the nurturing 6 creates a stable home base. The 1 must be careful not to dominate the gentle 2 or 6.</li>
    <li><strong>Potential Challenge With: 1, 8, 4.</strong> Two 1s can lead to a constant power struggle. The 8 is also a leader, creating a "too many chiefs" dynamic. The practical 4 may find the 1 too impulsive and risky.</li>
</ul>
<h2>Life Path 2: The Cooperative Diplomat</h2>
<p>Sensitive and intuitive, 2s thrive in partnership and seek harmony and emotional connection above all else.</p>
<ul>
    <li><strong>Most Compatible With: 4, 6, 8.</strong> The stable 4 provides security for the sensitive 2. The nurturing 6 shares the 2's love for home and family. The powerful 8 can be a protective and ambitious partner, with the 2 providing the emotional intelligence to soften the 8's edges.</li>
    <li><strong>Potential Harmony With: 1, 9.</strong> The leader 1 can be a good match if they respect the 2's need for partnership. The humanitarian 9 shares the 2's compassionate nature, creating a caring bond.</li>
    <li><strong>Potential Challenge With: 5.</strong> The freedom-loving 5 may feel too restless and inconsistent for the security-seeking 2.</li>
</ul>
<h2>Life Path 3: The Creative Communicator</h2>
<p>Expressive and optimistic, 3s need partners who appreciate their creativity and give them space to socialize and shine.</p>
<ul>
    <li><strong>Most Compatible With: 1, 5, 9.</strong> The 1 provides the focus and drive to help the 3 manifest their ideas. The 5 is a fun-loving partner in adventure. The 9's broad-mindedness appreciates the 3's creative spirit.</li>
    <li><strong>Potential Harmony With: 6, 8.</strong> The 6 can create a beautiful home life that inspires the 3's creativity. The 8 can provide the financial stability for the 3 to pursue their arts.</li>
    <li><strong>Potential Challenge With: 4, 7.</strong> The structured 4 may find the 3 too scattered and impractical. The introspective 7 might be overwhelmed by the 3's social energy.</li>
</ul>
<h2>Life Path 4: The Disciplined Builder</h2>
<p>Hardworking and pragmatic, 4s seek stability and loyalty. They are building an empire and need a reliable co-pilot.</p>
<ul>
    <li><strong>Most Compatible With: 2, 7, 8.</strong> The supportive 2 is an ideal, harmonious partner. The analytical 7 shares the 4's love for detail and logic. The ambitious 8 is a power-partner, sharing the 4's drive for success.</li>
    <li><strong>Potential Harmony With: 6.</strong> The 6 shares the 4's commitment to home and family, creating a very stable union.</li>
    <li><strong>Potential Challenge With: 1, 3, 5.</strong> The 1 is too independent and risk-taking. The 3 is too chaotic and undisciplined. The 5 is too much of a free spirit for the security-focused 4.</li>
</ul>
<h2>Life Path 5: The Freedom Seeker</h2>
<p>Adaptable and adventurous, 5s need change, excitement, and a partner who gives them plenty of space.</p>
<ul>
    <li><strong>Most Compatible With: 1, 3, 7.</strong> The 1 is a dynamic partner in adventure. The 3 shares the 5's love for fun and socializing. The 7 brings a dose of intellectual curiosity that fascinates the 5.</li>
    <li><strong>Potential Harmony With: None are naturally easy, but all are possible with effort.</strong> 5s are versatile and can get along with most numbers, as long as their freedom isn't curtailed.</li>
    <li><strong>Potential Challenge With: 2, 4, 6.</strong> The 2 and 6 need more security and domesticity than the 5 can often provide. The 4's need for routine is the antithesis of the 5's lifestyle.</li>
</ul>
<h2>Life Path 6: The Responsible Nurturer</h2>
<p>Family-oriented and compassionate, 6s are the caretakers of the zodiac, seeking a beautiful home and a loving, committed partnership.</p>
<ul>
    <li><strong>Most Compatible With: 2, 4, 9.</strong> The 2 shares the 6's love for harmony and partnership. The 4 provides the stability the 6 craves. The compassionate 9 is a wonderful match, creating a relationship built on selfless service.</li>
    <li><strong>Potential Harmony With: 1, 8.</strong> A 6 can create a loving sanctuary for the ambitious 1 or 8 to return to after a long day of conquering the world.</li>
    <li><strong>Potential Challenge With: 3, 5.</strong> The 3 may be too focused on their own self-expression, and the 5 is too restless for the home-loving 6.</li>
</ul>
<h2>Life Path 7: The Introspective Seeker</h2>
<p>Analytical and spiritual, 7s are on a quest for knowledge and truth. They need a partner who respects their need for solitude and engages them intellectually.</p>
<ul>
    <li><strong>Most Compatible With: 4, 5.</strong> The 4 provides a grounding force for the often-cerebral 7. The adventurous 5 brings the 7 out of their shell and into the world for new experiences.</li>
    <li><strong>Potential Harmony With: 9.</strong> The wise 9 can have deep, philosophical conversations with the 7, creating a strong mental and spiritual bond.</li>
    <li><strong>Potential Challenge With: 1, 2, 8.</strong> The 1 and 8 are too focused on the material world for the spiritual 7. The 2 may need more emotional expression than the sometimes-reserved 7 can provide.</li>
</ul>
<h2>Life Path 8: The Ambitious Powerhouse</h2>
<p>Driven and authoritative, 8s are here to achieve mastery in the material world. They need a partner who is their equal and supports their grand ambitions.</p>
<ul>
    <li><strong>Most Compatible With: 2, 4, 6.</strong> The diplomatic 2 is a fantastic partner who can manage the social and emotional aspects of their shared life. The 4 is a rock-solid partner in building an empire. The 6 can provide a stable and loving home environment.</li>
    <li><strong>Potential Harmony With: 3.</strong> A 3 can bring joy and creativity into the 8's often work-focused life.</li>
    <li><strong>Potential Challenge With: 1, 8.</strong> Two 1s or two 8s in a relationship can lead to a constant battle for control.</li>
</ul>
<h2>Life Path 9: The Compassionate Humanitarian</h2>
<p>Wise and idealistic, 9s are here to serve the world. They need a partner who shares their compassionate worldview and understands their need to give back.</p>
<ul>
    <li><strong>Most Compatible With: 3, 6.</strong> The creative 3 is inspired by the 9's idealism. The nurturing 6 shares the 9's compassionate and giving nature.</li>
    <li><strong>Potential Harmony With: 2, 7.</strong> The 2 is a loving and supportive partner. The 7 shares the 9's quest for deeper meaning and wisdom.</li>
    <li><strong>Potential Challenge With: 4, 8.</strong> The practical 4 and material-focused 8 may clash with the 9's more selfless and idealistic approach to life.</li>
</ul>
<h2>The Master Numbers (11, 22, 33) in Relationships</h2>
<p>Master Numbers carry a higher vibration and a more intense life purpose. In relationships, they often feel "old souls" and need partners who understand their unique path and the pressures that come with it. They are often compatible with each other and with numbers that support their foundational energy (11 with 2, 22 with 4, 33 with 6).</p>
<h2>Beyond the Life Path: A Holistic View</h2>
<p>While the Life Path number provides the most crucial insight, a full compatibility reading compares all core numbers (Destiny, Soul Urge, Personality) for a complete picture. One challenging Life Path pairing can be beautifully balanced by harmonious Destiny or Soul Urge numbers. Numerology is a language of energy and potential. It doesn't seal your fate, but rather, it hands you the key to understanding your relationship's unique energetic dance. By embracing your combined strengths and consciously working on your challenges, you can create a partnership that is not just compatible, but truly transformative.</p>
`,
    },
];

const BADGES: Record<BadgeId, Badge> = {
    first_step: { id: 'first_step', name: 'First Step', description: 'You completed your first name analysis. Welcome!', icon: FootstepsIcon },
    curious_explorer: { id: 'curious_explorer', name: 'Curious Explorer', description: 'Completed 5 different name analyses.', icon: CompassIcon },
    numerology_novice: { id: 'numerology_novice', name: 'Numerology Novice', description: 'Unlocked a detailed numerology report.', icon: BookOpenIcon },
    high_achiever: { id: 'high_achiever', name: 'High Achiever', description: 'Analyzed a name that scored 90 or higher.', icon: TrophyIcon },
    perfect_harmony: { id: 'perfect_harmony', name: 'Perfect Harmony', description: 'Found a compatibility score of 95 or higher.', icon: HeartIcon },
    dynamic_duo: { id: 'dynamic_duo', name: 'Dynamic Duo', description: 'Completed your first compatibility analysis.', icon: UsersIcon },
    consistent_seeker: { id: 'consistent_seeker', name: 'Consistent Seeker', description: 'Maintained a 3-day analysis streak.', icon: FireIcon },
    weekly_wisdom: { id: 'weekly_wisdom', name: 'Weekly Wisdom', description: 'Maintained a 7-day analysis streak.', icon: SunIcon },
};

// --- RENDER FUNCTIONS (UI) ---

function renderHeader() {
    const userMenu = state.isLoggedIn ? `
        <div class="relative" id="user-menu-container">
            <button id="user-menu-button" class="flex items-center space-x-2 text-sm font-medium text-gray-600 hover:text-[var(--color-primary)] transition-colors">
                <span>${state.currentUser?.name || 'Account'}</span>
                ${UserCircleIcon('h-8 w-8 text-gray-400')}
            </button>
            <div id="user-menu-dropdown" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 ring-1 ring-black ring-opacity-5">
                <a href="#" id="dashboard-link" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Dashboard</a>
                <a href="#" id="blog-link-menu" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Blog</a>
                <a href="#" id="logout-button" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Logout</a>
            </div>
        </div>
    ` : `
        <button id="login-button" class="text-gray-600 hover:text-[var(--color-primary)] font-semibold transition-colors">Log In</button>
        <button id="signup-button" class="bg-[var(--color-primary)] text-white px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity shadow-sm">Sign Up</button>
    `;

    return `
        <header class="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-gray-200">
            <div class="container mx-auto px-6 py-3 flex justify-between items-center">
                <a href="/" class="flex items-center space-x-2">
                    <div class="w-8 h-8 bg-[var(--color-primary)] rounded-full flex items-center justify-center text-white font-bold text-xl font-serif">N</div>
                    <span class="text-2xl font-bold font-serif text-[var(--color-primary)]">NameScore</span>
                </a>
                <nav class="hidden md:flex items-center space-x-6">
                    <a href="#analysis-section" class="text-gray-600 hover:text-[var(--color-primary)] font-medium">Calculator</a>
                    <a href="#why-us" class="text-gray-600 hover:text-[var(--color-primary)] font-medium">Why Us?</a>
                    <a href="#" id="blog-link-header" class="text-gray-600 hover:text-[var(--color-primary)] font-medium">Blog</a>
                </nav>
                <div class="flex items-center space-x-4">
                    ${userMenu}
                </div>
            </div>
        </header>
    `;
}

function renderFooter() {
    return `
        <footer class="bg-gray-50 border-t">
            <div class="container mx-auto px-6 py-12">
                <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div>
                        <a href="#" class="flex items-center space-x-2">
                             <div class="w-8 h-8 bg-[var(--color-primary)] rounded-full flex items-center justify-center text-white font-bold text-xl font-serif">N</div>
                             <span class="text-2xl font-bold font-serif text-[var(--color-primary)]">NameScore</span>
                        </a>
                        <p class="mt-4 text-gray-500 text-sm">Unlock the hidden power of your name with the wisdom of numerology.</p>
                    </div>
                    <div>
                        <h3 class="font-semibold text-gray-800 tracking-wide">Explore</h3>
                        <ul class="mt-4 space-y-2">
                            <li><a href="#analysis-section" class="text-gray-500 hover:text-[var(--color-primary)] text-sm">Name Calculator</a></li>
                            <li><a href="#why-us" class="text-gray-500 hover:text-[var(--color-primary)] text-sm">How It Works</a></li>
                            <li><a href="#faq" class="text-gray-500 hover:text-[var(--color-primary)] text-sm">FAQ</a></li>
                        </ul>
                    </div>
                    <div>
                        <h3 class="font-semibold text-gray-800 tracking-wide">Company</h3>
                        <ul class="mt-4 space-y-2">
                            <li><a href="#" id="blog-link-footer" class="text-gray-500 hover:text-[var(--color-primary)] text-sm">Blog</a></li>
                            <li><a href="#" class="text-gray-500 hover:text-[var(--color-primary)] text-sm">About Us</a></li>
                            <li><a href="#" class="text-gray-500 hover:text-[var(--color-primary)] text-sm">Contact</a></li>
                        </ul>
                    </div>
                    <div>
                         <h3 class="font-semibold text-gray-800 tracking-wide">Get Insights</h3>
                         <p class="text-sm text-gray-500 mt-4">Subscribe for weekly numerology tips and insights.</p>
                         <form class="mt-3 flex">
                            <input type="email" placeholder="Your email" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-l-md focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] outline-none">
                            <button class="bg-[var(--color-primary)] text-white px-3 rounded-r-md text-sm font-semibold hover:opacity-90 transition-opacity">Go</button>
                         </form>
                    </div>
                </div>
                <div class="mt-12 pt-8 border-t border-gray-200 text-center text-sm text-gray-500">
                    <p>&copy; ${new Date().getFullYear()} NameScore. All rights reserved. For entertainment purposes only.</p>
                    <p class="mt-1"><a href="/admin" id="admin-link" class="hover:underline">Admin</a></p>
                </div>
            </div>
        </footer>
    `;
}
function renderHeroSection() {
    const { heroFormMode } = state;
    const isPersonal = heroFormMode === 'personal';
    const isBaby = heroFormMode === 'baby';
    const isBrand = heroFormMode === 'brand';
    const isCompatibility = heroFormMode === 'compatibility';

    const placeholders = {
        personal: { name1: "e.g., John Michael Smith", name2: "" },
        baby: { name1: "e.g., Aurora Lily Hayes", name2: "" },
        brand: { name1: "e.g., Apex Innovations", name2: "" },
        compatibility: { name1: "Your Full Name", name2: "Partner's Full Name" }
    };

    return `
        <section id="analysis-section" class="hero-image-container text-white py-20 md:py-32">
            <div class="hero-overlay"></div>
            <div class="container mx-auto px-6 relative z-10 text-center">
                <h1 class="text-4xl md:text-6xl font-extrabold font-serif leading-tight">
                    Discover the <span class="animate-shimmer text-transparent">Hidden Power</span> of Your Name
                </h1>
                <p class="mt-6 text-lg md:text-xl text-purple-200 max-w-3xl mx-auto">
                    Your name is more than a label—it's a vibrational blueprint. Get a free, instant analysis of your name's numerological score and unlock its secret potential.
                </p>

                <div class="max-w-2xl mx-auto mt-12">
                    <div class="hero-form-card">
                        <div class="mode-selector">
                            <button class="mode-selector-btn" data-mode="personal" aria-selected="${isPersonal}">
                                ${UserCircleIcon('h-7 w-7')} <span>Personal</span>
                            </button>
                            <button class="mode-selector-btn" data-mode="baby" aria-selected="${isBaby}">
                                ${BabyIcon('h-7 w-7')} <span>Baby</span>
                            </button>
                            <button class="mode-selector-btn" data-mode="brand" aria-selected="${isBrand}">
                                ${BriefcaseIcon('h-7 w-7')} <span>Brand</span>
                            </button>
                             <button class="mode-selector-btn" data-mode="compatibility" aria-selected="${isCompatibility}">
                                ${HeartIcon('h-7 w-7')} <span>Couples</span>
                            </button>
                        </div>

                        <form id="name-form">
                            <div class="form-group">
                                <label for="name" class="sr-only">${isCompatibility ? 'First Name' : 'Full Name'}</label>
                                <input type="text" id="name" name="name" placeholder="${placeholders[heroFormMode].name1}" required class="text-center text-lg">
                            </div>
                            
                            <div class="form-group ${isCompatibility ? '' : 'hidden'}" id="name2-group">
                                <label for="name2" class="sr-only">Second Name</label>
                                <input type="text" id="name2" name="name2" placeholder="${placeholders[heroFormMode].name2}" class="text-center text-lg">
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div class="form-group">
                                    <label for="birthdate" class="sr-only">Birthdate</label>
                                    <input type="date" id="birthdate" name="birthdate" required class="text-center" title="Your birthdate is required for an accurate Life Path calculation.">
                                    <p class="input-hint text-left">${isCompatibility ? "Your Birthdate" : "Required for Life Path Score"}</p>
                                </div>
                                <div class="form-group">
                                    <label for="goal" class="sr-only">Analysis Goal</label>
                                    <select id="goal" name="goal" class="text-center">
                                        ${analysisGoals.map(g => `<option value="${g}">${g}</option>`).join('')}
                                    </select>
                                    <p class="input-hint text-left">Tailor your insights</p>
                                </div>
                            </div>

                             <div class="form-group ${isCompatibility ? '' : 'hidden'}" id="birthdate2-group">
                                    <label for="birthdate2" class="sr-only">Partner's Birthdate</label>
                                    <input type="date" id="birthdate2" name="birthdate2" class="text-center" title="Partner's birthdate is required for an accurate Life Path calculation.">
                                    <p class="input-hint text-left">Partner's Birthdate</p>
                             </div>

                            <div class="cta-group">
                                <button type="submit" id="analyze-button" class="btn-primary">
                                    Analyze My Name
                                </button>
                            </div>
                            <p class="privacy-hint">${PadlockIcon('inline-block h-3 w-3 mr-1')} We respect your privacy. Your birthdate is never stored.</p>
                        </form>
                         <div class="how-it-works mt-8">
                            <div class="how-it-works-step">${KeyboardIcon()} <span>Enter Name & Goal</span></div>
                            <div class="how-it-works-step">${SparklesIcon()} <span>AI Analyzes Vibration</span></div>
                            <div class="how-it-works-step">${KeyIcon()} <span>Unlock Insights</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
}


function renderWhyUsSection() {
    return `
        <section id="why-us" class="py-20 bg-white">
            <div class="container mx-auto px-6">
                <div class="text-center mb-12">
                    <h2 class="text-4xl font-bold font-serif text-gray-800">Why Trust NameScore?</h2>
                    <p class="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">We blend ancient wisdom with modern technology to give you the most accurate and insightful name analysis available.</p>
                </div>
                <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
                    <div class="text-center p-6">
                        <div class="inline-block p-4 bg-purple-100 rounded-full text-[var(--color-primary)]">
                           ${LayersIcon('h-8 w-8')}
                        </div>
                        <h3 class="mt-4 text-xl font-bold">Comprehensive Analysis</h3>
                        <p class="mt-2 text-gray-600">We go beyond a simple score, calculating your Destiny, Soul Urge, Personality, and Life Path numbers for a complete picture.</p>
                    </div>
                    <div class="text-center p-6">
                         <div class="inline-block p-4 bg-purple-100 rounded-full text-[var(--color-primary)]">
                           ${LightbulbIcon('h-8 w-8')}
                        </div>
                        <h3 class="mt-4 text-xl font-bold">Personalized Insights</h3>
                        <p class="mt-2 text-gray-600">Our AI tailors your results based on your personal goals, whether it's for career, relationships, or self-discovery.</p>
                    </div>
                    <div class="text-center p-6">
                         <div class="inline-block p-4 bg-purple-100 rounded-full text-[var(--color-primary)]">
                           ${MedalIcon('h-8 w-8')}
                        </div>
                        <h3 class="mt-4 text-xl font-bold">Actionable Suggestions</h3>
                        <p class="mt-2 text-gray-600">Discover powerful, subtle tweaks to your name that can enhance its numerological harmony and elevate its score.</p>
                    </div>
                </div>
            </div>
        </section>
    `;
}

function renderTestimonials() {
    return `
        <section class="py-20 bg-gray-50 overflow-hidden">
            <div class="container mx-auto px-6">
                 <div class="text-center mb-12">
                    <h2 class="text-4xl font-bold font-serif text-gray-800">Life-Changing Insights</h2>
                    <p class="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">Don't just take our word for it. Here's how NameScore has impacted others.</p>
                </div>
                <div class="grid lg:grid-cols-3 gap-8 items-start">
                    <div class="testimonial-card bg-white p-6 rounded-lg shadow-lg">
                        <p class="text-gray-600">"I was skeptical, but the analysis was scarily accurate. It described my inner world perfectly. The suggestion to add an 'a' to my professional name felt so right, and my confidence has soared."</p>
                        <div class="mt-4 flex items-center">
                            <img class="w-12 h-12 rounded-full" src="https://randomuser.me/api/portraits/women/68.jpg" alt="Jessica M.">
                            <div class="ml-4">
                                <p class="font-semibold">Jessica M.</p>
                                <p class="text-sm text-gray-500">Marketing Consultant</p>
                            </div>
                        </div>
                    </div>
                     <div class="testimonial-card bg-white p-6 rounded-lg shadow-lg">
                        <p class="text-gray-600">"We were stuck on a name for our startup. NameScore helped us find a name that not only sounded great but had the right numerological vibration for success. We've felt the positive momentum ever since."</p>
                        <div class="mt-4 flex items-center">
                            <img class="w-12 h-12 rounded-full" src="https://randomuser.me/api/portraits/men/32.jpg" alt="David L.">
                            <div class="ml-4">
                                <p class="font-semibold">David L.</p>
                                <p class="text-sm text-gray-500">Tech Founder</p>
                            </div>
                        </div>
                    </div>
                     <div class="testimonial-card bg-white p-6 rounded-lg shadow-lg">
                        <p class="text-gray-600">"The compatibility report was a game-changer for my relationship. It gave us a new language to understand our strengths and challenges. We're communicating better than ever."</p>
                        <div class="mt-4 flex items-center">
                            <img class="w-12 h-12 rounded-full" src="https://randomuser.me/api/portraits/women/44.jpg" alt="Sarah P.">
                            <div class="ml-4">
                                <p class="font-semibold">Sarah P.</p>
                                <p class="text-sm text-gray-500">Yoga Instructor</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
}

function renderFaq() {
    const faqs = [
        { q: "Is this real numerology?", a: "Yes! We use the ancient Pythagorean system to calculate your core numbers. It’s centuries-old wisdom, made simple and instant for you." },
        { q: "Will I have to legally change my name?", a: "Not at all! Many people use a 'social' name for professional profiles or introductions. The universe responds to the vibration you use most often." },
        { q: "How do the 'name fixes' work?", a: "Our AI analyzes your core numbers and suggests small, powerful letter changes (like adding an 'a' or doubling a consonant) to improve your name’s numerological harmony." },
        { q: "Is my data safe?", a: "Absolutely. Your birthdate is used only for the calculation and is never stored on our servers. We value your privacy." },
        { q: "What if I don't like my report?", a: "We're confident you'll find it insightful. We offer a 7-day, no-questions-asked refund on all paid reports." },
        { q: "Can I use this for my baby or brand?", a: "Yes! A balanced name can give a new venture or a new life a wonderful start. Just select 'Baby' or 'Brand' mode for a tailored analysis." },
    ];
    return `
        <section id="faq" class="py-20 bg-white">
            <div class="container mx-auto px-6 max-w-3xl">
                <div class="text-center mb-12">
                    <h2 class="text-4xl font-bold font-serif text-gray-800">Frequently Asked Questions</h2>
                </div>
                <div class="space-y-4">
                    ${faqs.map((faq, i) => `
                        <details class="p-4 border rounded-lg" ${i < 2 ? 'open' : ''}>
                            <summary class="font-semibold cursor-pointer">${faq.q}</summary>
                            <p class="mt-2 text-gray-600">${faq.a}</p>
                        </details>
                    `).join('')}
                </div>
            </div>
        </section>
    `;
}

function renderFinalCta() {
    return `
        <section class="bg-gray-800 text-white">
            <div class="container mx-auto px-6 py-20 text-center">
                 <h2 class="text-4xl font-bold font-serif">Ready to Discover Your Name's True Potential?</h2>
                 <p class="mt-4 text-lg text-gray-300 max-w-2xl mx-auto">Your free, personalized numerology report is just 30 seconds away. Find the harmony and power hidden in your name today.</p>
                 <a href="#analysis-section" class="mt-8 inline-block bg-[var(--color-secondary)] text-gray-900 px-10 py-4 rounded-lg text-lg font-bold hover:scale-105 transition-transform">Get My Free Analysis</a>
            </div>
        </section>
    `;
}

function renderBlogSection() {
    const featuredPosts = BLOG_POSTS.slice(0, 3);
    return `
        <section id="blog" class="py-20 bg-gray-50">
            <div class="container mx-auto px-6">
                <div class="text-center mb-12">
                    <h2 class="text-4xl font-bold font-serif text-gray-800">From Our Numerology Journal</h2>
                    <p class="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">Explore articles on numerology, naming, and personal growth from our experts.</p>
                </div>
                <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    ${featuredPosts.map(post => `
                        <a href="#" class="blog-post-card group" data-slug="${post.slug}">
                            <div class="bg-white rounded-xl shadow-md overflow-hidden h-full transition-all duration-300 group-hover:shadow-xl group-hover:-translate-y-1">
                                <img class="h-48 w-full object-cover" src="${post.image}" alt="${post.title}">
                                <div class="p-6">
                                    <h3 class="text-xl font-bold text-gray-900 group-hover:text-[var(--color-primary)] transition-colors">${post.title}</h3>
                                    <p class="mt-3 text-gray-600 text-sm">${post.excerpt}</p>
                                    <div class="mt-4 text-xs text-gray-500">${post.author} &bull; ${new Date(post.date).toLocaleDateString()}</div>
                                </div>
                            </div>
                        </a>
                    `).join('')}
                </div>
                <div class="text-center mt-12">
                    <a href="#" id="view-all-posts" class="text-lg font-semibold text-[var(--color-primary)] hover:underline">View All Posts &rarr;</a>
                </div>
            </div>
        </section>
    `;
}

function renderScoreGauge(score: number, scoreText: string) {
    const circumference = 2 * Math.PI * 50; // r=50
    const offset = circumference - (score / 100) * circumference;
    return `
        <div class="relative w-48 h-48">
            <svg class="w-full h-full" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" stroke-width="10" stroke="#e9d5ff" fill="none" />
                <circle
                    class="score-circle-progress"
                    cx="60" cy="60" r="50" stroke-width="10"
                    stroke="url(#scoreGradient)" fill="none"
                    stroke-linecap="round"
                    transform="rotate(-90 60 60)"
                    stroke-dasharray="${circumference}"
                    style="stroke-dashoffset: ${offset};"
                />
                <defs>
                    <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#a855f7" />
                        <stop offset="100%" stop-color="#6b21a8" />
                    </linearGradient>
                </defs>
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-5xl font-extrabold text-white">${score}</span>
                <span class="text-sm font-semibold text-purple-200 uppercase tracking-wider">${scoreText}</span>
            </div>
        </div>
    `;
}

function renderCoreNumberCard(icon: string, title: string, number: number, score: number, description: string) {
  return `
    <div class="core-number-card bg-white p-5 rounded-xl shadow-sm border">
      <div class="flex items-center space-x-4">
        <div class="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-[var(--color-primary)]">
          ${icon}
        </div>
        <div>
          <h4 class="font-bold text-lg text-gray-800">${title}</h4>
          <p class="text-sm text-gray-500">Number ${number}</p>
        </div>
      </div>
      <div class="mt-4">
        <div class="flex justify-between items-center mb-1">
            <span class="text-sm font-medium text-gray-600">Harmony Score</span>
            <span class="text-sm font-bold text-[var(--color-primary)]">${score}/25</span>
        </div>
        <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${score / 25 * 100}%;"></div>
        </div>
      </div>
    </div>
  `;
}

function renderResultsDisplay(analysis: NameAnalysisResult) {
    const { score, breakdown, short_rationale, positive_traits, challenges, coreNumbers, suggestions, holistic_rationale } = analysis;
    const scoreText = getScoreText(score);

    return `
        <section class="py-20 mystical-background">
            <div id="analysis-results-content" class="container mx-auto px-6 animate-fade-in">
                <div class="text-center mb-12">
                    <h2 class="text-4xl font-bold font-serif text-gray-800">Your Name Analysis for "${state.currentName}"</h2>
                    <p class="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">Here's the numerological breakdown of your name's unique vibrational signature.</p>
                </div>
                
                <div class="grid lg:grid-cols-3 gap-8 items-start">
                    <!-- Left Column: Score Card -->
                    <div class="lg:col-span-1 space-y-8">
                        <div class="score-card text-white p-8 rounded-2xl shadow-2xl flex flex-col items-center text-center animate-score-pop">
                            ${renderScoreGauge(score, scoreText)}
                            <h3 class="text-2xl font-bold mt-6">Holistic Name Score</h3>
                            <p class="mt-2 text-purple-200">${short_rationale}</p>
                            ${holistic_rationale ? `
                                <div class="mt-4 pt-4 border-t border-purple-400 border-opacity-30 w-full">
                                    <p class="text-sm text-purple-100 text-left"><strong class="font-semibold block mb-1">${SparklesIcon('inline-block h-4 w-4 mr-1')} AI Insight</strong> ${holistic_rationale}</p>
                                </div>
                            ` : ''}
                        </div>
                         <div class="bg-white p-6 rounded-2xl shadow-lg border">
                            <h3 class="font-bold text-xl text-center text-gray-800 mb-4">Share Your Score</h3>
                             <div class="flex justify-center space-x-4">
                                <button data-network="facebook" class="social-share-btn flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">Facebook</button>
                                <button data-network="twitter" class="social-share-btn flex-1 bg-black text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-800 transition-colors">Twitter</button>
                                <button data-network="linkedin" class="social-share-btn flex-1 bg-blue-800 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-900 transition-colors">LinkedIn</button>
                            </div>
                        </div>
                    </div>

                    <!-- Right Column: Details -->
                    <div class="lg:col-span-2 space-y-8">
                        <div class="grid md:grid-cols-2 gap-6">
                            ${renderCoreNumberCard(LifePathIcon(), 'Life Path', coreNumbers.lifePathNumber, breakdown.life_path, 'Your life\'s journey and lessons.')}
                            ${renderCoreNumberCard(DestinyIcon(), 'Destiny', coreNumbers.destinyNumber, breakdown.destiny, 'Your potential and life purpose.')}
                            ${renderCoreNumberCard(SoulUrgeIcon(), 'Soul Urge', coreNumbers.soulUrgeNumber, breakdown.soul_urge, 'Your inner desires and motivations.')}
                            ${renderCoreNumberCard(PersonalityIcon(), 'Personality', coreNumbers.personalityNumber, breakdown.personality, 'How others perceive you.')}
                        </div>

                        <div class="grid md:grid-cols-2 gap-6">
                            <div class="bg-white p-6 rounded-xl shadow-sm border">
                                <h3 class="font-bold text-xl text-gray-800 mb-3 flex items-center">${CheckmarkIcon('text-green-500 mr-2')} Positive Traits</h3>
                                <ul class="space-y-2">
                                    ${positive_traits.map(trait => `<li class="flex items-start"><span class="text-green-500 mr-2 mt-1">&#10003;</span><span>${trait}</span></li>`).join('')}
                                </ul>
                            </div>
                             <div class="bg-white p-6 rounded-xl shadow-sm border">
                                <h3 class="font-bold text-xl text-gray-800 mb-3 flex items-center">${ExclamationIcon('text-yellow-500 mr-2')} Potential Challenges</h3>
                                <ul class="space-y-2">
                                    ${challenges.map(challenge => `<li class="flex items-start"><span class="text-yellow-500 mr-2 mt-1">&#9888;</span><span>${challenge}</span></li>`).join('')}
                                </ul>
                            </div>
                        </div>
                        
                        <!-- Suggestions Section -->
                        <div class="bg-white p-6 rounded-xl shadow-sm border">
                             <h3 class="font-bold text-xl text-center text-gray-800 mb-4">Suggestions to Elevate Your Name's Score</h3>
                             <div class="space-y-4">
                                ${suggestions.slice(0, 3).map(s => `
                                    <div class="suggestion-card">
                                        <div class="flex justify-between items-center">
                                            <div>
                                                <p class="font-bold text-lg text-[var(--color-primary)]">${s.suggested_name}</p>
                                                <p class="text-sm text-gray-600">${s.reason}</p>
                                            </div>
                                            <div class="text-right ml-4">
                                                <p class="text-2xl font-bold text-green-500">${s.new_score}</p>
                                                <p class="text-xs text-gray-500">New Score</p>
                                            </div>
                                        </div>
                                    </div>
                                `).join('')}
                             </div>
                             <div class="mt-6 text-center bg-gray-50 p-4 rounded-lg">
                                <p class="font-semibold text-gray-700">Want deeper insights and more suggestions?</p>
                                <p class="text-sm text-gray-600">Unlock your full 15-page numerology report for a complete guide to your name's potential.</p>
                                <button id="purchase-report-button" class="mt-3 bg-[var(--color-secondary)] text-gray-900 px-6 py-2 rounded-lg font-bold hover:scale-105 transition-transform">
                                    Unlock Full Report
                                </button>
                             </div>
                        </div>

                    </div>
                </div>
            </div>
        </section>
    `;
}

function renderCompatibilityResultsDisplay(analysis: CompatibilityAnalysisResult) {
    const { score, title, names, strengths, challenges, summary } = analysis;
    const scoreText = getScoreText(score);
     return `
        <section class="py-20 mystical-background">
            <div id="analysis-results-content" class="container mx-auto px-6 animate-fade-in">
                 <div class="text-center mb-12">
                    <h2 class="text-4xl font-bold font-serif text-gray-800">Compatibility for ${names[0]} & ${names[1]}</h2>
                    <p class="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">An insight into the energetic connection and dynamics between you.</p>
                </div>
                 <div class="max-w-4xl mx-auto">
                    <div class="grid md:grid-cols-3 gap-8">
                        <div class="md:col-span-1 flex justify-center">
                             <div class="score-card text-white p-8 rounded-2xl shadow-2xl flex flex-col items-center text-center animate-score-pop w-full">
                                ${renderScoreGauge(score, scoreText)}
                                <h3 class="text-2xl font-bold mt-6">Compatibility Score</h3>
                                <p class="mt-2 text-purple-200">${title}</p>
                            </div>
                        </div>
                        <div class="md:col-span-2 space-y-6">
                             <div class="bg-white p-6 rounded-xl shadow-sm border">
                                <h3 class="font-bold text-xl text-gray-800 mb-3 flex items-center">${HeartIcon('text-pink-500 mr-2')} Shared Strengths</h3>
                                <p class="text-gray-700">${strengths}</p>
                            </div>
                             <div class="bg-white p-6 rounded-xl shadow-sm border">
                                <h3 class="font-bold text-xl text-gray-800 mb-3 flex items-center">${ExclamationIcon('text-yellow-500 mr-2')} Potential Challenges</h3>
                                 <p class="text-gray-700">${challenges}</p>
                            </div>
                             <div class="bg-white p-6 rounded-xl shadow-sm border">
                                <h3 class="font-bold text-xl text-gray-800 mb-3 flex items-center">${SparklesIcon('text-purple-500 mr-2')} Our Summary</h3>
                                 <p class="text-gray-700">${summary}</p>
                            </div>
                        </div>
                    </div>
                 </div>
            </div>
        </section>
     `;
}

function renderAnalysisLoader() {
    return `
        <div class="flex flex-col items-center justify-center py-40 text-center px-6">
            ${LoadingSpinner('h-16 w-16')}
            <h2 class="mt-8 text-3xl font-bold font-serif text-gray-800">Calculating Your Score...</h2>
            <p class="mt-2 text-gray-600">Analyzing the vibrational frequencies of your name. This will just take a moment!</p>
        </div>
    `;
}

function renderBlogView() {
    return `
        <div class="container mx-auto px-6 py-12">
            <h1 class="text-4xl md:text-5xl font-bold font-serif text-center mb-12">The NameScore Journal</h1>
            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                ${BLOG_POSTS.map(post => `
                    <a href="#" class="blog-post-card group" data-slug="${post.slug}">
                        <div class="bg-white rounded-xl shadow-md overflow-hidden h-full transition-all duration-300 group-hover:shadow-xl group-hover:-translate-y-1">
                            <img class="h-48 w-full object-cover" src="${post.image}" alt="${post.title}">
                            <div class="p-6">
                                <h3 class="text-xl font-bold text-gray-900 group-hover:text-[var(--color-primary)] transition-colors">${post.title}</h3>
                                <p class="mt-3 text-gray-600 text-sm">${post.excerpt}</p>
                                <div class="mt-4 text-xs text-gray-500">${post.author} &bull; ${new Date(post.date).toLocaleDateString()}</div>
                            </div>
                        </div>
                    </a>
                `).join('')}
            </div>
        </div>
    `;
}
function renderBlogPostView(post: BlogPost) {
    const otherPosts = BLOG_POSTS.filter(p => p.slug !== post.slug).slice(0, 2);
    return `
        <div class="bg-white">
            <div class="relative py-16 sm:py-24">
                 <div class="absolute inset-0">
                    <img class="h-full w-full object-cover" src="${post.image}" alt="">
                    <div class="absolute inset-0 bg-gray-900 bg-opacity-60"></div>
                </div>
                <div class="relative px-6 lg:px-8 max-w-4xl mx-auto text-center">
                    <h1 class="text-4xl font-bold tracking-tight text-white sm:text-6xl font-serif">${post.title}</h1>
                    <p class="mt-6 text-xl text-gray-300">${post.excerpt}</p>
                    <div class="mt-8 text-sm text-gray-400">By ${post.author} on ${new Date(post.date).toLocaleDateString()}</div>
                </div>
            </div>

            <div class="relative px-6 lg:px-8">
                <div class="mx-auto max-w-3xl py-16 prose">
                   ${post.content}
                </div>
            </div>
             <div class="bg-gray-50 py-16">
                <div class="mx-auto max-w-7xl px-6 lg:px-8">
                    <h2 class="text-2xl font-bold tracking-tight text-gray-900 text-center">More from the journal</h2>
                    <div class="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 border-t border-gray-200 pt-10 sm:mt-16 sm:pt-16 lg:mx-0 lg:max-w-none lg:grid-cols-3">
                         ${otherPosts.map(p => `
                            <a href="#" data-slug="${p.slug}" class="blog-post-card flex max-w-xl flex-col items-start justify-between">
                                <div class="group relative">
                                    <h3 class="mt-3 text-lg font-semibold leading-6 text-gray-900 group-hover:text-gray-600">${p.title}</h3>
                                    <p class="mt-5 line-clamp-3 text-sm leading-6 text-gray-600">${p.excerpt}</p>
                                </div>
                                <div class="relative mt-8 flex items-center gap-x-4">
                                    <div class="text-sm leading-6">
                                        <p class="font-semibold text-gray-900">${p.author}</p>
                                    </div>
                                </div>
                            </a>
                         `).join('')}
                         <div class="flex items-center justify-center">
                             <a href="#" id="view-all-posts-from-post" class="text-lg font-semibold text-[var(--color-primary)] hover:underline">View All Posts &rarr;</a>
                         </div>
                    </div>
                </div>
             </div>
        </div>
    `;
}

function renderAuthModal() {
    const { authModalState, authLoading } = state;
    if (authModalState === 'hidden') return '<div id="auth-modal-container"></div>';

    const isLogin = authModalState === 'login';

    const content = authLoading ? `
        <div class="flex justify-center items-center p-20">
            ${LoadingSpinner()}
        </div>
    ` : `
        <h2 class="text-2xl font-bold text-center text-gray-800">${isLogin ? 'Welcome Back!' : 'Create Your Account'}</h2>
        <p class="text-center text-gray-500 mt-2">
            ${isLogin ? "Log in to access your dashboard." : "Join to save your history and track progress."}
        </p>

        <div class="mt-6">
            <button id="google-signin" class="w-full flex justify-center items-center gap-3 py-2.5 px-4 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                ${GoogleIcon()} <span class="font-semibold text-gray-700">Continue with Google</span>
            </button>
        </div>
        
        <div class="my-4 flex items-center">
            <hr class="w-full border-t border-gray-300" />
            <span class="px-2 text-sm text-gray-500 bg-white">OR</span>
            <hr class="w-full border-t border-gray-300" />
        </div>
        
        <form id="auth-form" class="space-y-4">
            <div class="${isLogin ? 'hidden' : ''}">
                <label for="name-auth" class="text-sm font-medium text-gray-700">Full Name</label>
                <input id="name-auth" name="name" type="text" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] sm:text-sm">
            </div>
            <div>
                <label for="email-auth" class="text-sm font-medium text-gray-700">Email address</label>
                <input id="email-auth" name="email" type="email" autocomplete="email" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] sm:text-sm">
            </div>
            <div>
                <label for="password-auth" class="text-sm font-medium text-gray-700">Password</label>
                <input id="password-auth" name="password" type="password" autocomplete="current-password" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] sm:text-sm">
            </div>
            
            <p id="auth-error" class="text-sm text-red-600"></p>

            <div>
                <button type="submit" class="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-purple-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-primary)]">
                    ${isLogin ? 'Log In' : 'Create Account'}
                </button>
            </div>
        </form>

        <p class="mt-6 text-center text-sm text-gray-500">
            ${isLogin ? "Don't have an account?" : "Already have an account?"}
            <button id="toggle-auth-mode" class="font-medium text-[var(--color-primary)] hover:underline">${isLogin ? 'Sign up' : 'Log in'}</button>
        </p>
    `;

    return `
        <div id="auth-modal-container">
            <div id="auth-modal-overlay" class="fixed inset-0 bg-black bg-opacity-50 z-50 animate-fade-in"></div>
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div class="relative bg-white rounded-lg shadow-xl w-full max-w-md p-8 animate-fade-slide-in">
                    <button id="close-auth-modal" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">&times;</button>
                    ${content}
                </div>
            </div>
        </div>
    `;
}

function renderToastNotifications() {
    return `
        <div id="toast-container" class="fixed bottom-5 right-5 z-50 space-y-3">
            ${state.toastQueue.map((badge, index) => `
                <div id="toast-${badge.id}" class="bg-gray-800 text-white rounded-lg shadow-lg p-4 flex items-center space-x-4 max-w-sm animate-toast-in" 
                     style="animation-delay: ${index * 100}ms">
                    <div class="text-yellow-400">${badge.icon('h-8 w-8')}</div>
                    <div>
                        <p class="font-bold">Badge Unlocked: ${badge.name}</p>
                        <p class="text-sm text-gray-300">${badge.description}</p>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}
function renderCheckoutModal() {
    if (!state.isCheckoutOpen) return '<div id="checkout-modal-container"></div>';

    const { type, name, score } = state.checkoutData;
    const isReport = type === 'report';
    const price = PRICING_DATA[state.currency][type];
    const symbol = currencySymbols[state.currency];
    const title = isReport ? `Your Full Numerology Report for "${name}"` : 'The Name Discovery Bundle';
    const description = isReport ? 'A 15-page deep-dive into your name\'s potential.' : 'Get the full report plus 5 extra name analyses.';

    return `
        <div id="checkout-modal-container">
            <div id="checkout-modal-overlay" class="fixed inset-0 bg-black bg-opacity-60 z-50 animate-fade-in"></div>
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div class="relative bg-white rounded-lg shadow-xl w-full max-w-md animate-fade-slide-in">
                    <button id="close-checkout-modal" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">&times;</button>
                    <div class="p-8">
                        <h2 class="text-2xl font-bold text-gray-800">${title}</h2>
                        <p class="text-gray-600 mt-2">${description}</p>
                        
                        <div class="mt-6 bg-gray-50 rounded-lg p-4">
                            <div class="flex justify-between items-center">
                                <span class="text-lg font-semibold text-gray-700">Total</span>
                                <span class="text-2xl font-bold text-[var(--color-primary)]">${symbol}${price}</span>
                            </div>
                        </div>

                        <div class="mt-6">
                            <h3 class="font-semibold text-gray-700">What you'll get:</h3>
                            <ul class="mt-2 space-y-2 text-gray-600 text-sm">
                                <li class="flex items-center">${CheckmarkIcon('text-green-500 mr-2')} Detailed breakdown of all 4 core numbers</li>
                                <li class="flex items-center">${CheckmarkIcon('text-green-500 mr-2')} Personalized challenges & opportunities</li>
                                <li class="flex items-center">${CheckmarkIcon('text-green-500 mr-2')} Top 10 tailored name suggestions</li>
                                <li class="flex items-center">${CheckmarkIcon('text-green-500 mr-2')} Printable PDF for your records</li>
                                 <li class="flex items-center ${isReport ? 'line-through text-gray-400' : ''}">
                                    ${isReport ? XCircleIcon('mr-2') : CheckmarkIcon('text-green-500 mr-2')} 
                                    5 Additional Name Analysis Credits
                                </li>
                            </ul>
                        </div>
                        
                        <div class="mt-8">
                            <button id="confirm-purchase" class="w-full bg-[var(--color-secondary)] text-gray-900 px-6 py-3 rounded-lg text-lg font-bold hover:scale-105 transition-transform">
                                Complete Purchase
                            </button>
                            <p class="text-xs text-center text-gray-500 mt-2">Secure payment processing. 7-day money-back guarantee.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderDashboard() {
    const { currentUser, userProgress } = state;
    if (!currentUser || !userProgress) {
        return `<div class="p-10 text-center">${LoadingSpinner()}</div>`;
    }

    const { name, history } = currentUser;
    const { currentStreak, highScore, unlockedBadgeIds } = userProgress;
    
    const unlockedBadges = unlockedBadgeIds.map(id => BADGES[id]);
    const lockedBadges = Object.values(BADGES).filter(b => !unlockedBadgeIds.includes(b.id));

    return `
        <div class="bg-gray-50 min-h-screen">
            <div class="container mx-auto px-6 py-12">
                <h1 class="text-3xl font-bold text-gray-800">Welcome back, ${name.split(' ')[0]}!</h1>
                <p class="text-gray-600 mt-1">Here's a summary of your numerology journey.</p>

                <!-- Gamification Stats -->
                <div class="grid md:grid-cols-3 gap-6 mt-8">
                    <div class="bg-white p-6 rounded-lg shadow-sm border flex items-center space-x-4">
                        ${FireIcon('h-10 w-10 text-orange-500')}
                        <div>
                            <p class="text-sm text-gray-500">Current Streak</p>
                            <p class="text-2xl font-bold text-gray-800">${currentStreak} Days</p>
                        </div>
                    </div>
                    <div class="bg-white p-6 rounded-lg shadow-sm border flex items-center space-x-4">
                        ${TrophyIcon('h-10 w-10 text-yellow-500')}
                        <div>
                            <p class="text-sm text-gray-500">Highest Score</p>
                            <p class="text-2xl font-bold text-gray-800">${highScore}</p>
                        </div>
                    </div>
                    <div class="bg-white p-6 rounded-lg shadow-sm border flex items-center space-x-4">
                        ${MedalIcon('h-10 w-10 text-blue-500')}
                        <div>
                            <p class="text-sm text-gray-500">Badges Unlocked</p>
                            <p class="text-2xl font-bold text-gray-800">${unlockedBadges.length} / ${Object.keys(BADGES).length}</p>
                        </div>
                    </div>
                </div>

                <!-- Badges Collection -->
                <div class="bg-white p-6 rounded-lg shadow-sm border mt-8">
                    <h2 class="text-xl font-bold text-gray-800 mb-4">Your Badge Collection</h2>
                    <div class="flex flex-wrap gap-4">
                        ${unlockedBadges.map(badge => `
                            <div class="badge-wrapper text-center">
                                <div class="w-16 h-16 bg-purple-100 text-[var(--color-primary)] rounded-full flex items-center justify-center">
                                    ${badge.icon('h-8 w-8')}
                                </div>
                                <p class="text-xs mt-1 font-semibold">${badge.name}</p>
                                <div class="badge-tooltip">${badge.description}</div>
                            </div>
                        `).join('')}
                        ${lockedBadges.map(badge => `
                            <div class="badge-wrapper text-center opacity-40">
                                <div class="w-16 h-16 bg-gray-200 text-gray-500 rounded-full flex items-center justify-center">
                                    ${badge.icon('h-8 w-8')}
                                </div>
                                <p class="text-xs mt-1 font-semibold">${badge.name}</p>
                                <div class="badge-tooltip">${badge.description} (Locked)</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Analysis History -->
                <div class="bg-white p-6 rounded-lg shadow-sm border mt-8">
                    <h2 class="text-xl font-bold text-gray-800 mb-4">Analysis History</h2>
                    <div class="divide-y divide-gray-200">
                        ${history.length > 0 ? history.map(item => `
                            <div class="py-3 flex justify-between items-center">
                                <div>
                                    <p class="font-semibold text-gray-800">${item.name}</p>
                                    <p class="text-sm text-gray-500">${item.goal} &bull; ${item.date}</p>
                                </div>
                                <div class="flex items-center space-x-4">
                                    <span class="font-bold text-lg text-[var(--color-primary)]">${item.score}</span>
                                    <button class="download-pdf-btn text-gray-400 hover:text-[var(--color-primary)]" data-history-id="${item.id}" title="Download Report">
                                        ${DocumentDownloadIcon()}
                                    </button>
                                </div>
                            </div>
                        `).join('') : '<p class="text-gray-500 text-center py-4">No analyses yet. Go calculate your first score!</p>'}
                    </div>
                </div>

            </div>
        </div>
    `;
}

function renderAdminLogin() { /* ... */ return ''; }
function renderAdminDashboard() { /* ... */ return ''; }


function renderIdleView() {
    return `
        ${renderHeroSection()}
        ${renderWhyUsSection()}
        ${renderTestimonials()}
        ${renderBlogSection()}
        ${renderFaq()}
        ${renderFinalCta()}
    `;
}

function renderApp() {
    const root = document.getElementById('root');
    if (!root) return;

    let mainContent = '';
    switch (state.view) {
        case 'idle':
            mainContent = renderIdleView();
            break;
        case 'loading':
            mainContent = renderAnalysisLoader();
            break;
        case 'results':
            if (state.analysis) {
                 mainContent = renderResultsDisplay(state.analysis);
            } else if (state.compatibilityAnalysis) {
                mainContent = renderCompatibilityResultsDisplay(state.compatibilityAnalysis);
            }
            break;
        case 'blog':
            mainContent = renderBlogView();
            break;
        case 'blogPost':
            if (state.currentBlogPost) {
                mainContent = renderBlogPostView(state.currentBlogPost);
            }
            break;
        case 'dashboard':
            mainContent = renderDashboard();
            break;
        case 'error':
            mainContent = `<div class="text-center py-20"><h2 class="text-2xl font-bold">An Error Occurred</h2><p class="text-red-500 mt-2">${state.error}</p></div>`;
            break;
    }
    
    root.innerHTML = `
        ${renderHeader()}
        <main>${mainContent}</main>
        ${renderFooter()}
    `;

    // Append modals and toasts outside of the main root flow
    document.body.insertAdjacentHTML('beforeend', renderAuthModal());
    document.body.insertAdjacentHTML('beforeend', renderToastNotifications());
    document.body.insertAdjacentHTML('beforeend', renderCheckoutModal());


    initializeEventListeners();
}

// --- LOGIC & EVENT HANDLERS ---

async function handleNameAnalysis(form: HTMLFormElement) {
    setState({ view: 'loading', analysis: null, compatibilityAnalysis: null, error: null });
    const formData = new FormData(form);
    const name = formData.get('name') as string;
    const birthdate = formData.get('birthdate') as string;
    const goal = formData.get('goal') as AnalysisGoal;

    try {
        const response = await analyzeNameCallable({ name, birthdate, goal, mode: 'personal' });
        const result = response.data as NameAnalysisResult;
        
        setState({
            view: 'results',
            analysis: result,
            currentName: name,
        });

        // Award first_step badge if not already unlocked
        if (state.isLoggedIn && state.userProgress && !state.userProgress.unlockedBadgeIds.includes('first_step')) {
            const userRef = doc(db, 'users', state.currentUser.uid);
            await updateDoc(userRef, {
                'progress.unlockedBadgeIds': arrayUnion('first_step')
            });
            showToast(BADGES.first_step);
        }

        // Add to history if logged in
        if (state.isLoggedIn && state.currentUser) {
            const historyItem: AnalysisHistoryItem = {
                id: `hist_${Date.now()}`,
                name,
                score: result.score,
                date: new Date().toLocaleDateString(),
                goal,
                mode: state.heroFormMode
            };
            const userRef = doc(db, 'users', state.currentUser.uid);
            await updateDoc(userRef, {
                history: arrayUnion(historyItem)
            });
            // Also update local state
             setState({
                currentUser: { ...state.currentUser, history: [...state.currentUser.history, historyItem] }
            });
        }
    } catch (err: any) {
        console.error("Analysis Error:", err);
        setState({ view: 'error', error: err.message || 'Could not analyze name.' });
    }
}
async function handleCompatibilityAnalysis(form: HTMLFormElement) {
    setState({ view: 'loading', analysis: null, compatibilityAnalysis: null, error: null });
     const formData = new FormData(form);
     const name1 = formData.get('name') as string;
     const birthdate1 = formData.get('birthdate') as string;
     const name2 = formData.get('name2') as string;
     const birthdate2 = formData.get('birthdate2') as string;

    try {
        const response = await analyzeCompatibilityCallable({ name1, birthdate1, name2, birthdate2 });
        const result = response.data as CompatibilityAnalysisResult;
        setState({ view: 'results', compatibilityAnalysis: result, currentName: name1, currentName2: name2 });

    } catch (err: any) {
         console.error("Compatibility Analysis Error:", err);
         setState({ view: 'error', error: err.message || 'Could not analyze compatibility.' });
    }
}
async function handlePurchase(type: 'report' | 'bundle') {
    if (!state.isLoggedIn) {
        showAuthModal('signup');
        return;
    }
    setState({
        isCheckoutOpen: true,
        checkoutData: {
            type,
            name: state.currentName,
            score: state.analysis?.score,
        },
    });
}
function updateMetaTags(name: string, score: number, rationale: string, imageUrl?: string | null) {
  const newTitle = `${name} | Name Score: ${score} - Is it a good name?`;
  const newDesc = `I just scored the name "${name}" and got ${score}/100! ${rationale} Find out your name's score for free.`;
  
  document.getElementById('meta-title')!.textContent = newTitle;
  (document.getElementById('meta-description') as HTMLMetaElement).content = newDesc;
  (document.getElementById('og-title') as HTMLMetaElement).content = newTitle;
  (document.getElementById('og-description') as HTMLMetaElement).content = newDesc;
  (document.getElementById('twitter-title') as HTMLMetaElement).content = newTitle;
  (document.getElementById('twitter-description') as HTMLMetaElement).content = newDesc;
  
  if (imageUrl) {
    (document.getElementById('og-image') as HTMLMetaElement).content = imageUrl;
    (document.getElementById('twitter-image') as HTMLMetaElement).content = imageUrl;
  }
}

function getScoreText(score: number): string {
    if (score >= 90) return "Exceptional";
    if (score >= 80) return "Excellent";
    if (score >= 70) return "Very Good";
    if (score >= 60) return "Good";
    if (score >= 50) return "Average";
    if (score >= 40) return "Below Average";
    return "Needs Improvement";
}

async function generatePdfReport(historyId: string) {
    const { currentUser, userProgress } = state;
    if (!currentUser || !userProgress) return;

    const historyItem = currentUser.history.find(h => h.id === historyId);
    if (!historyItem) return;

    // A bit of a hack: to generate the PDF, we need the full analysis object.
    // In a real app, this would be stored or refetched. For now, we'll re-run a simplified analysis.
    // This is NOT ideal for production due to cost and latency.
    try {
        const response = await analyzeNameCallable({ name: historyItem.name, birthdate: "01/01/2000", goal: historyItem.goal, mode: historyItem.mode });
        const analysisData = response.data as NameAnalysisResult;
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'px',
            format: 'a4',
        });

        const reportHtml = `
            <div style="font-family: 'Manrope', sans-serif; color: #333; padding: 40px; width: 450px; background: white;">
                <h1 style="font-family: 'Playfair Display', serif; font-size: 28px; color: #5B2E9B; text-align: center;">Numerology Report</h1>
                <h2 style="font-size: 22px; text-align: center; color: #444;">${historyItem.name}</h2>
                <div style="text-align: center; margin: 20px 0;">
                    <p style="font-size: 14px; color: #666;">Overall Score</p>
                    <p style="font-size: 48px; font-weight: 800; color: #5B2E9B; margin: 0;">${analysisData.score}</p>
                    <p style="font-size: 16px; color: #5B2E9B;">${getScoreText(analysisData.score)}</p>
                </div>
                <p style="font-size: 14px; line-height: 1.6; text-align: center; font-style: italic; background: #f9f7fd; padding: 15px; border-radius: 8px;">
                    ${analysisData.short_rationale}
                </p>
                <h3 style="font-size: 18px; font-weight: 700; margin-top: 30px; border-bottom: 2px solid #e9d5ff; padding-bottom: 5px;">Core Numbers</h3>
                <p style="margin-top: 15px;"><strong>Life Path: ${analysisData.coreNumbers.lifePathNumber}</strong>, <strong>Destiny: ${analysisData.coreNumbers.destinyNumber}</strong>, <strong>Soul Urge: ${analysisData.coreNumbers.soulUrgeNumber}</strong>, <strong>Personality: ${analysisData.coreNumbers.personalityNumber}</strong></p>
                 <h3 style="font-size: 18px; font-weight: 700; margin-top: 30px; border-bottom: 2px solid #e9d5ff; padding-bottom: 5px;">Positive Traits</h3>
                 <ul style="padding-left: 20px; margin-top: 15px;">${analysisData.positive_traits.map(t => `<li style="margin-bottom: 5px;">${t}</li>`).join('')}</ul>
                 <h3 style="font-size: 18px; font-weight: 700; margin-top: 30px; border-bottom: 2px solid #e9d5ff; padding-bottom: 5px;">Potential Challenges</h3>
                 <ul style="padding-left: 20px; margin-top: 15px;">${analysisData.challenges.map(c => `<li style="margin-bottom: 5px;">${c}</li>`).join('')}</ul>
                 <p style="margin-top: 40px; text-align: center; font-size: 12px; color: #999;">Report generated by NameScore on ${new Date().toLocaleDateString()}</p>
            </div>
        `;
        
        const renderContainer = document.getElementById('pdf-render-container')!;
        renderContainer.innerHTML = reportHtml;
        
        await window.html2canvas(renderContainer.firstElementChild as HTMLElement).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`${historyItem.name.replace(/ /g, '_')}_Report.pdf`);
        });

        renderContainer.innerHTML = '';


    } catch (e) {
        console.error("Failed to generate PDF:", e);
        alert("Sorry, we couldn't generate the PDF report at this time.");
    }
}

function handleSocialShare(network: 'facebook' | 'twitter' | 'linkedin') {
    if (!state.analysis) return;
    const { score } = state.analysis;
    const { currentName } = state;
    
    const text = `I just discovered the numerology score for "${currentName}" is ${score}/100! Find out the hidden power of your own name. #NameScore #Numerology`;
    const url = "https://www.namescore.com";
    let shareUrl = '';

    switch (network) {
        case 'facebook':
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`;
            break;
        case 'twitter':
            shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
            break;
        case 'linkedin':
             shareUrl = `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}&title=Discover Your Name Score&summary=${encodeURIComponent(text)}`;
            break;
    }
    window.open(shareUrl, '_blank', 'width=600,height=400');
}

function showAuthModal(mode: AuthModalState) {
    setState({ authModalState: mode });
}

async function handleLogout() {
    await signOut(auth);
    setState({ isLoggedIn: false, currentUser: null, userProgress: null, view: 'idle' });
}

async function processLogin(user: FirebaseUser) {
    setState({ authLoading: true });
    const userRef = doc(db, "users", user.uid);
    let userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
        const newUser: Omit<CurrentUser, 'uid'> = {
            name: user.displayName || 'New User',
            email: user.email!,
            history: [],
        };
        const newProgress: UserProgress = {
            analysesCompleted: 0,
            compatibilityAnalyses: 0,
            lastCheckin: null,
            currentStreak: 0,
            highScore: 0,
            unlockedBadgeIds: [],
        };
        await setDoc(userRef, { ...newUser, progress: newProgress, createdAt: serverTimestamp() });
        userDoc = await getDoc(userRef);
    }
    
    const userData = userDoc.data();
    setState({
        isLoggedIn: true,
        currentUser: {
            uid: user.uid,
            name: userData.name,
            email: userData.email,
            history: userData.history || [],
        },
        userProgress: userData.progress,
        authModalState: 'hidden',
        authLoading: false,
    });
}
function showToast(badge: Badge) {
    // Avoid duplicate toasts
    if (state.toastQueue.some(b => b.id === badge.id)) return;

    setState({ toastQueue: [...state.toastQueue, badge] });
    setTimeout(() => {
        const toastEl = document.getElementById(`toast-${badge.id}`);
        if(toastEl) {
            toastEl.classList.remove('animate-toast-in');
            toastEl.classList.add('animate-toast-out');
            toastEl.addEventListener('animationend', () => {
                 setState({ toastQueue: state.toastQueue.filter(b => b.id !== badge.id) });
            }, { once: true });
        }
    }, 4000); // Show for 4 seconds
}

// --- EVENT LISTENER INITIALIZATION ---

function initializeEventListeners() {
    // --- Hero Form ---
    const nameForm = document.getElementById('name-form');
    if (nameForm) {
        nameForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if(state.heroFormMode === 'compatibility') {
                handleCompatibilityAnalysis(e.target as HTMLFormElement);
            } else {
                handleNameAnalysis(e.target as HTMLFormElement);
            }
        });
    }

    // --- Mode Selector ---
    document.querySelectorAll('.mode-selector-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const mode = (e.currentTarget as HTMLElement).dataset.mode as NameMode;
            setState({ heroFormMode: mode });
        });
    });

    // --- Purchase Buttons ---
    document.getElementById('purchase-report-button')?.addEventListener('click', () => handlePurchase('report'));
    
    // Social Share
    document.querySelectorAll('.social-share-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const network = (e.currentTarget as HTMLElement).dataset.network as 'facebook'|'twitter'|'linkedin';
            handleSocialShare(network);
        });
    });

    // --- Blog Navigation ---
    document.querySelectorAll('#blog-link-header, #blog-link-footer, #blog-link-menu, #view-all-posts, #view-all-posts-from-post').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            setState({ view: 'blog', currentBlogPost: null });
             window.scrollTo(0, 0);
        });
    });
    document.querySelectorAll('.blog-post-card').forEach(card => {
        card.addEventListener('click', (e) => {
            e.preventDefault();
            const slug = (e.currentTarget as HTMLElement).dataset.slug;
            const post = BLOG_POSTS.find(p => p.slug === slug);
            if(post) {
                setState({ view: 'blogPost', currentBlogPost: post });
                window.scrollTo(0, 0);
            }
        });
    });
    
    // Auth Modal
    document.getElementById('login-button')?.addEventListener('click', () => showAuthModal('login'));
    document.getElementById('signup-button')?.addEventListener('click', () => showAuthModal('signup'));
    document.getElementById('close-auth-modal')?.addEventListener('click', () => setState({ authModalState: 'hidden' }));
    document.getElementById('auth-modal-overlay')?.addEventListener('click', () => setState({ authModalState: 'hidden' }));
    document.getElementById('toggle-auth-mode')?.addEventListener('click', () => {
        setState({ authModalState: state.authModalState === 'login' ? 'signup' : 'login' });
    });
    
     // User Menu Dropdown
    const userMenuButton = document.getElementById('user-menu-button');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    userMenuButton?.addEventListener('click', () => {
        userMenuDropdown?.classList.toggle('hidden');
    });
     document.addEventListener('click', (event) => {
        const container = document.getElementById('user-menu-container');
        if (container && !container.contains(event.target as Node)) {
            userMenuDropdown?.classList.add('hidden');
        }
    });
    document.getElementById('dashboard-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        setState({ view: 'dashboard' });
        window.scrollTo(0,0);
    });

    document.getElementById('logout-button')?.addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout();
    });

    // Checkout Modal
    document.getElementById('close-checkout-modal')?.addEventListener('click', () => setState({ isCheckoutOpen: false }));
    document.getElementById('checkout-modal-overlay')?.addEventListener('click', () => setState({ isCheckoutOpen: false }));

     // Download PDF
    document.querySelectorAll('.download-pdf-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const historyId = (e.currentTarget as HTMLElement).dataset.historyId;
            if (historyId) {
                (e.currentTarget as HTMLButtonElement).disabled = true;
                generatePdfReport(historyId).finally(() => {
                     (e.currentTarget as HTMLButtonElement).disabled = false;
                });
            }
        });
    });

    // Auth Form Submission
    const authForm = document.getElementById('auth-form');
    if(authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target as HTMLFormElement);
            const email = formData.get('email') as string;
            const password = formData.get('password') as string;
            const name = formData.get('name') as string;
            const errorEl = document.getElementById('auth-error')!;
            errorEl.textContent = '';
            setState({ authLoading: true });
            
            try {
                if (state.authModalState === 'signup') {
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    // In a real app, you'd update the profile here.
                    // For now, processLogin will create the Firestore doc.
                } else {
                    await signInWithEmailAndPassword(auth, email, password);
                }
                // onAuthStateChanged will handle the rest
            } catch (error: any) {
                errorEl.textContent = error.message;
                setState({ authLoading: false });
            }
        });
    }

    // Google Sign-in
    const googleBtn = document.getElementById('google-signin');
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            const provider = new GoogleAuthProvider();
             const errorEl = document.getElementById('auth-error')!;
             errorEl.textContent = '';
             setState({ authLoading: true });
            try {
                await signInWithPopup(auth, provider);
                 // onAuthStateChanged will handle the rest
            } catch (error: any) {
                errorEl.textContent = error.message;
                setState({ authLoading: false });
            }
        });
    }

}
// --- INITIALIZATION ---
onAuthStateChanged(auth, (user) => {
  if (user) {
      if (!state.isLoggedIn) { // Only run if state is not already set
          processLogin(user);
      }
  } else {
    setState({ isLoggedIn: false, currentUser: null, userProgress: null, authLoading: false });
  }
});

renderApp();