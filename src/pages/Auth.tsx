import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, Lock, User, AlertCircle, Eye, EyeOff, ShieldCheck, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '@/assets/logo.png';
import PasswordStrengthIndicator, { isPasswordValid } from '@/components/auth/PasswordStrengthIndicator';
import AuthBackground from '@/components/auth/AuthBackground';
import { checkRateLimit, recordAttempt, resetAttempts } from '@/lib/rateLimiter';
import { lovable } from '@/integrations/lovable';

const emailSchema = z.string().trim().email('Invalid email address');

type AuthView = 'main' | 'forgot' | 'reset';

const tabVariants = {
  enter: { opacity: 0, y: 12 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 } as const,
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number], staggerChildren: 0.08 },
  },
};

const childVariants = {
  hidden: { opacity: 0, y: 12 } as const,
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

const logoVariants = {
  hidden: { opacity: 0, scale: 0.8, rotate: -8 } as const,
  visible: { opacity: 1, scale: 1, rotate: 0, transition: { type: 'spring' as const, stiffness: 200, damping: 15 } },
};

// Button micro-interaction props
const btnMotion = {
  whileHover: { scale: 1.02, transition: { duration: 0.15 } },
  whileTap: { scale: 0.97 },
};

const btnSecondaryMotion = {
  whileHover: { scale: 1.04, transition: { duration: 0.15 } },
  whileTap: { scale: 0.95 },
};

const iconBtnMotion = {
  whileHover: { scale: 1.15, transition: { duration: 0.12 } },
  whileTap: { scale: 0.9 },
};

// Inline error helper
const FieldError = ({ message }: { message?: string }) => {
  if (!message) return null;
  return (
    <motion.p
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="text-xs text-[hsl(var(--bear))] mt-1"
    >
      {message}
    </motion.p>
  );
};

const GoogleIcon = () => (
  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading, signIn, signUp, resetPassword, updatePassword } = useAuth();

  const [view, setView] = useState<AuthView>('main');
  const [activeTab, setActiveTab] = useState('login');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Signup form
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState('');

  // Reset password (after recovery link)
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Inline validation
  const fieldErrors = useMemo(() => {
    const errors: Record<string, string | undefined> = {};

    // Login
    if (touched['loginEmail'] && loginEmail.trim()) {
      try { emailSchema.parse(loginEmail.trim()); } catch { errors.loginEmail = 'Invalid email address'; }
    }

    // Signup
    if (touched['signupEmail'] && signupEmail.trim()) {
      try { emailSchema.parse(signupEmail.trim()); } catch { errors.signupEmail = 'Invalid email address'; }
    }
    if (touched['signupPassword'] && signupPassword && !isPasswordValid(signupPassword)) {
      errors.signupPassword = 'Password needs at least 4 of 5 requirements';
    }
    if (touched['signupConfirmPassword'] && signupConfirmPassword && signupPassword !== signupConfirmPassword) {
      errors.signupConfirmPassword = 'Passwords do not match';
    }

    // Forgot
    if (touched['forgotEmail'] && forgotEmail.trim()) {
      try { emailSchema.parse(forgotEmail.trim()); } catch { errors.forgotEmail = 'Invalid email address'; }
    }

    // Reset
    if (touched['newPassword'] && newPassword && !isPasswordValid(newPassword)) {
      errors.newPassword = 'Password needs at least 4 of 5 requirements';
    }
    if (touched['confirmNewPassword'] && confirmNewPassword && newPassword !== confirmNewPassword) {
      errors.confirmNewPassword = 'Passwords do not match';
    }

    return errors;
  }, [touched, loginEmail, signupEmail, signupPassword, signupConfirmPassword, forgotEmail, newPassword, confirmNewPassword]);

  const markTouched = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));

  // Detect recovery flow from URL
  useEffect(() => {
    if (searchParams.get('type') === 'recovery') {
      setView('reset');
    }
  }, [searchParams]);

  // Redirect if already logged in (and not in reset flow)
  useEffect(() => {
    // If we just came back from an OAuth provider, the URL hash carries the
    // tokens and onAuthStateChange is mid-flight. Skip the redirect for one
    // tick to let the session apply cleanly.
    if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
      return;
    }
    if (user && !authLoading && view !== 'reset') {
      navigate('/dashboard');
    }
  }, [user, authLoading, navigate, view]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError(null);
    try {
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError(result.error.message || 'Google sign-in failed. Please try again.');
      }
    } catch (err) {
      setError('Google sign-in failed. Please try again.');
    }
    setIsGoogleLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const rl = checkRateLimit();
    if (!rl.allowed) {
      setError(`Too many attempts. Try again in ${rl.remainingSeconds}s.`);
      setCooldown(rl.remainingSeconds);
      return;
    }

    try { emailSchema.parse(loginEmail.trim()); } catch {
      setError('Invalid email address');
      return;
    }
    if (loginPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    const { error } = await signIn(loginEmail.trim(), loginPassword);

    if (error) {
      const result = recordAttempt();
      if (result.locked) {
        setError(`Too many failed attempts. Locked for ${result.remainingSeconds}s.`);
        setCooldown(result.remainingSeconds);
      } else if (error.message.includes('Invalid login credentials')) {
        setError('Invalid credentials. Please check your email and password.');
      } else if (error.message.includes('Email not confirmed')) {
        setError('Please verify your email before signing in. Check your inbox for the confirmation link.');
      } else {
        setError(error.message);
      }
    } else {
      resetAttempts();
    }
    setIsLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try { emailSchema.parse(signupEmail.trim()); } catch {
      setError('Invalid email address');
      return;
    }
    if (!isPasswordValid(signupPassword)) {
      setError('Password must meet at least 4 of the 5 strength requirements.');
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    const { error } = await signUp(signupEmail.trim(), signupPassword, displayName.trim());

    if (error) {
      if (error.message.includes('already registered')) {
        setError('This email is already registered. Try signing in.');
      } else {
        setError(error.message);
      }
    } else {
      setSuccess('Account created! Check your email inbox for a verification link before signing in.');
      setSignupEmail('');
      setSignupPassword('');
      setSignupConfirmPassword('');
      setDisplayName('');
      setTouched({});
    }
    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try { emailSchema.parse(forgotEmail.trim()); } catch {
      setError('Invalid email address');
      return;
    }

    setIsLoading(true);
    const { error } = await resetPassword(forgotEmail.trim());
    if (error) { setError(error.message); } else {
      setSuccess('If an account exists with that email, you will receive a password reset link.');
    }
    setIsLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isPasswordValid(newPassword)) {
      setError('Password must meet at least 4 of the 5 strength requirements.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    const { error } = await updatePassword(newPassword);
    if (error) { setError(error.message); } else {
      setSuccess('Password updated successfully! Redirecting...');
      setTimeout(() => navigate('/dashboard'), 2000);
    }
    setIsLoading(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // -- Shared divider --
  const OAuthDivider = () => (
    <div className="relative my-4">
      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
      <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or continue with email</span></div>
    </div>
  );

  const GoogleButton = () => (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={handleGoogleSignIn}
      disabled={isGoogleLoading || isLoading}
    >
      {isGoogleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
      Continue with Google
    </Button>
  );

  // ---- Forgot Password View ----
  if (view === 'forgot') {
    return (
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <AuthBackground />
        <motion.div
          key="forgot"
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-md"
        >
          <Card className="border-border/15 bg-card/10 backdrop-blur-md shadow-2xl">
            <CardHeader className="text-center space-y-4">
              <motion.div variants={logoVariants} className="flex justify-center"><img src={logo} alt="Logo" className="h-20 w-auto" /></motion.div>
              <motion.div variants={childVariants}><CardTitle className="text-2xl font-bold">Reset Password</CardTitle></motion.div>
              <motion.div variants={childVariants}><CardDescription>Enter your email and we'll send you a reset link.</CardDescription></motion.div>
            </CardHeader>
            <form onSubmit={handleForgotPassword}>
              <CardContent className="space-y-4">
                {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
                {success && <Alert className="border-[hsl(var(--bull))]/50 bg-[hsl(var(--bull))]/10"><ShieldCheck className="h-4 w-4 text-[hsl(var(--bull))]" /><AlertDescription className="text-[hsl(var(--bull))]">{success}</AlertDescription></Alert>}
                <motion.div variants={childVariants} className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="forgot-email" type="email" placeholder="your@email.com" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} onBlur={() => markTouched('forgotEmail')} className="pl-10" required />
                  </div>
                  <AnimatePresence><FieldError message={fieldErrors.forgotEmail} /></AnimatePresence>
                </motion.div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <motion.div {...btnMotion} className="w-full">
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : 'Send Reset Link'}
                  </Button>
                </motion.div>
                <motion.div {...btnSecondaryMotion} className="w-full">
                  <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={() => { setView('main'); setError(null); setSuccess(null); setTouched({}); }}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sign In
                  </Button>
                </motion.div>
              </CardFooter>
            </form>
          </Card>
        </motion.div>
      </div>
    );
  }

  // ---- Reset Password View ----
  if (view === 'reset') {
    return (
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <AuthBackground />
        <motion.div
          key="reset"
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-md"
        >
          <Card className="border-border/15 bg-card/10 backdrop-blur-md shadow-2xl">
            <CardHeader className="text-center space-y-4">
              <motion.div variants={logoVariants} className="flex justify-center"><img src={logo} alt="Logo" className="h-20 w-auto" /></motion.div>
              <motion.div variants={childVariants}><CardTitle className="text-2xl font-bold">Set New Password</CardTitle></motion.div>
              <motion.div variants={childVariants}><CardDescription>Choose a strong new password for your account.</CardDescription></motion.div>
            </CardHeader>
            <form onSubmit={handleResetPassword}>
              <CardContent className="space-y-4">
                {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
                {success && <Alert className="border-[hsl(var(--bull))]/50 bg-[hsl(var(--bull))]/10"><ShieldCheck className="h-4 w-4 text-[hsl(var(--bull))]" /><AlertDescription className="text-[hsl(var(--bull))]">{success}</AlertDescription></Alert>}
                <motion.div variants={childVariants} className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="new-password" type={showNewPassword ? 'text' : 'password'} placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} onBlur={() => markTouched('newPassword')} className="pl-10 pr-10" required />
                    <motion.button {...iconBtnMotion} type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </motion.button>
                  </div>
                  <PasswordStrengthIndicator password={newPassword} />
                  <AnimatePresence><FieldError message={fieldErrors.newPassword} /></AnimatePresence>
                </motion.div>
                <motion.div variants={childVariants} className="space-y-2">
                  <Label htmlFor="confirm-new-password">Confirm New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="confirm-new-password" type="password" placeholder="••••••••" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} onBlur={() => markTouched('confirmNewPassword')} className="pl-10" required />
                  </div>
                  <AnimatePresence><FieldError message={fieldErrors.confirmNewPassword} /></AnimatePresence>
                </motion.div>
              </CardContent>
              <CardFooter>
                <motion.div {...btnMotion} className="w-full">
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</> : 'Update Password'}
                  </Button>
                </motion.div>
              </CardFooter>
            </form>
          </Card>
        </motion.div>
      </div>
    );
  }

  // ---- Main Login / Signup View ----
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <AuthBackground />
      <motion.div
        key="main"
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md"
      >
        <Card className="border-border/15 bg-card/10 backdrop-blur-md shadow-2xl">
          <CardHeader className="text-center space-y-4">
            <motion.div variants={logoVariants} className="flex justify-center"><img src={logo} alt="Logo" className="h-20 w-auto" /></motion.div>
            <motion.div variants={childVariants}><CardTitle className="text-2xl font-bold">PolyMath Terminal</CardTitle></motion.div>
            <motion.div variants={childVariants}><CardDescription>Log in to your account to get the most powerful insights from PolyMarket</CardDescription></motion.div>
          </CardHeader>

          {/* Google OAuth - above tabs */}
          <motion.div variants={childVariants} className="px-6">
            <motion.div {...btnMotion}>
              <GoogleButton />
            </motion.div>
            <OAuthDivider />
          </motion.div>

          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setError(null); setSuccess(null); setTouched({}); }} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mx-4" style={{ width: 'calc(100% - 2rem)' }}>
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                variants={tabVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'login' && (
                  <TabsContent value="login" forceMount>
                    <form onSubmit={handleLogin}>
                      <CardContent className="space-y-4">
                        {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

                        <div className="space-y-2">
                          <Label htmlFor="login-email">Email</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input id="login-email" type="email" placeholder="your@email.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} onBlur={() => markTouched('loginEmail')} className="pl-10" required />
                          </div>
                          <AnimatePresence><FieldError message={fieldErrors.loginEmail} /></AnimatePresence>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="login-password">Password</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input id="login-password" type={showLoginPassword ? 'text' : 'password'} placeholder="••••••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="pl-10 pr-10" required />
                            <motion.button {...iconBtnMotion} type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                              {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </motion.button>
                          </div>
                        </div>
                      </CardContent>

                      <CardFooter className="flex flex-col gap-3">
                        <motion.div {...btnMotion} className="w-full">
                          <Button type="submit" className="w-full" disabled={isLoading || cooldown > 0}>
                            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</> : cooldown > 0 ? `Locked (${cooldown}s)` : 'Sign In'}
                          </Button>
                        </motion.div>
                        <motion.div {...btnSecondaryMotion}>
                          <Button type="button" variant="link" className="text-sm text-muted-foreground hover:text-primary" onClick={() => { setView('forgot'); setError(null); setSuccess(null); setTouched({}); }}>
                            Forgot your password?
                          </Button>
                        </motion.div>
                      </CardFooter>
                    </form>
                  </TabsContent>
                )}

                {activeTab === 'signup' && (
                  <TabsContent value="signup" forceMount>
                    <form onSubmit={handleSignup}>
                      <CardContent className="space-y-4">
                        {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
                        {success && <Alert className="border-[hsl(var(--bull))]/50 bg-[hsl(var(--bull))]/10"><Mail className="h-4 w-4 text-[hsl(var(--bull))]" /><AlertDescription className="text-[hsl(var(--bull))]">{success}</AlertDescription></Alert>}

                        <div className="space-y-2">
                          <Label htmlFor="display-name">Name (optional)</Label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input id="display-name" type="text" placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="pl-10" />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="signup-email">Email</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input id="signup-email" type="email" placeholder="your@email.com" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} onBlur={() => markTouched('signupEmail')} className="pl-10" required />
                          </div>
                          <AnimatePresence><FieldError message={fieldErrors.signupEmail} /></AnimatePresence>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="signup-password">Password</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input id="signup-password" type={showSignupPassword ? 'text' : 'password'} placeholder="••••••••" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} onBlur={() => markTouched('signupPassword')} className="pl-10 pr-10" required />
                            <motion.button {...iconBtnMotion} type="button" onClick={() => setShowSignupPassword(!showSignupPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                              {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </motion.button>
                          </div>
                          <PasswordStrengthIndicator password={signupPassword} />
                          <AnimatePresence><FieldError message={fieldErrors.signupPassword} /></AnimatePresence>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="confirm-password">Confirm Password</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input id="confirm-password" type="password" placeholder="••••••••" value={signupConfirmPassword} onChange={(e) => setSignupConfirmPassword(e.target.value)} onBlur={() => markTouched('signupConfirmPassword')} className="pl-10" required />
                          </div>
                          <AnimatePresence><FieldError message={fieldErrors.signupConfirmPassword} /></AnimatePresence>
                        </div>
                      </CardContent>

                      <CardFooter>
                        <motion.div {...btnMotion} className="w-full">
                          <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...</> : 'Create Account'}
                          </Button>
                        </motion.div>
                      </CardFooter>
                    </form>
                  </TabsContent>
                )}
              </motion.div>
            </AnimatePresence>
          </Tabs>
        </Card>
      </motion.div>
    </div>
  );
};

export default Auth;
