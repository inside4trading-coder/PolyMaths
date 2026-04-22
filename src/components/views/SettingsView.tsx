import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';

import { SystemHealth } from '@/components/settings/SystemHealth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Checkbox } from '@/components/ui/checkbox';
import { Sun, Moon, Globe, Palette, Brain, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useToast } from '@/hooks/use-toast';
import { useAgentConfig, type AgentConfig } from '@/hooks/useAgentConfig';

const AVAILABLE_MODELS = [
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash (Fast)', description: 'Balanced speed and quality' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Good multimodal reasoning' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Best quality, slower' },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', description: 'Strong reasoning, efficient' },
  { id: 'openai/gpt-5', name: 'GPT-5', description: 'Most powerful, expensive' },
];

const CATEGORIES = ['Politics', 'Sports', 'Crypto', 'Economics', 'Entertainment', 'World'];

export function SettingsView() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { user } = useAuth();
  const { toast: toastHook } = useToast();
  const queryClient = useQueryClient();

  const { config: savedAgentConfig, isLoading: isLoadingConfig } = useAgentConfig();

  // Local editing state, synced from saved config
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(savedAgentConfig);

  useEffect(() => {
    setAgentConfig(savedAgentConfig);
  }, [savedAgentConfig]);

  // Save agent config mutation
  const saveAgentConfig = useMutation({
    mutationFn: async (configToSave: AgentConfig) => {
      if (configToSave.id) {
        const { error } = await supabase
          .from('agent_configs')
          .update({
            name: configToSave.name,
            model: configToSave.model,
            categories: configToSave.categories,
            risk_tolerance: configToSave.riskTolerance,
            analysis_depth: configToSave.analysisDepth,
          })
          .eq('id', configToSave.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('agent_configs')
          .insert({
            user_id: user?.id,
            name: configToSave.name,
            model: configToSave.model,
            categories: configToSave.categories,
            risk_tolerance: configToSave.riskTolerance,
            analysis_depth: configToSave.analysisDepth,
          })
          .select()
          .single();
        if (error) throw error;
        configToSave.id = data.id;
      }
      return configToSave;
    },
    onSuccess: (saved) => {
      setAgentConfig(saved);
      queryClient.invalidateQueries({ queryKey: ['agent-config'] });
      toastHook({
        title: t('agents.configSaved'),
        description: t('agents.configSavedDesc'),
      });
    },
    onError: (error: any) => {
      toastHook({
        title: t('agents.configError'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCategoryToggle = (category: string) => {
    setAgentConfig(prev => {
      const categories = prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category];
      return { ...prev, categories };
    });
  };


  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">{t('settings.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('settings.subtitle')}</p>
        </div>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-primary" />
              {t('settings.appearance')}
            </CardTitle>
            <CardDescription>{t('settings.appearanceDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? (
                  <Moon className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <Sun className="w-5 h-5 text-warning" />
                )}
                <div>
                  <Label htmlFor="theme-toggle" className="text-sm font-medium">
                    {t('settings.darkMode')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {theme === 'dark' ? t('settings.darkModeOn') : t('settings.lightModeOn')}
                  </p>
                </div>
              </div>
              <Switch
                id="theme-toggle"
                checked={theme === 'dark'}
                onCheckedChange={toggleTheme}
              />
            </div>
          </CardContent>
        </Card>

        {/* Language */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              {t('settings.language')}
            </CardTitle>
            <CardDescription>{t('settings.languageDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={language} onValueChange={(value: 'en' | 'es') => setLanguage(value)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* AI Agent Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              {t('settings.agentConfig')}
            </CardTitle>
            <CardDescription>{t('settings.agentConfigDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoadingConfig ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <>
                {/* Agent Name */}
                <div className="space-y-2">
                  <Label htmlFor="agent-name">{t('agents.agentName')}</Label>
                  <Input
                    id="agent-name"
                    value={agentConfig.name}
                    onChange={(e) => setAgentConfig(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="My Trading Agent"
                  />
                </div>

                {/* Model Selection */}
                <div className="space-y-2">
                  <Label>{t('agents.model')}</Label>
                  <Select
                    value={agentConfig.model}
                    onValueChange={(value) => setAgentConfig(prev => ({ ...prev, model: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_MODELS.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          <div className="flex flex-col">
                            <span>{model.name}</span>
                            <span className="text-xs text-muted-foreground">{model.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Categories */}
                <div className="space-y-2">
                  <Label>{t('agents.categories')}</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {CATEGORIES.map((category) => (
                      <div key={category} className="flex items-center space-x-2">
                        <Checkbox
                          id={`cat-${category}`}
                          checked={agentConfig.categories.includes(category)}
                          onCheckedChange={() => handleCategoryToggle(category)}
                        />
                        <label htmlFor={`cat-${category}`} className="text-sm cursor-pointer">
                          {category}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Risk Tolerance */}
                <div className="space-y-2">
                  <Label>{t('agents.riskTolerance')}</Label>
                  <Select
                    value={agentConfig.riskTolerance}
                    onValueChange={(value) => setAgentConfig(prev => ({ ...prev, riskTolerance: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conservative">{t('agents.conservative')}</SelectItem>
                      <SelectItem value="medium">{t('agents.medium')}</SelectItem>
                      <SelectItem value="aggressive">{t('agents.aggressive')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Analysis Depth */}
                <div className="space-y-2">
                  <Label>{t('agents.analysisDepth')}</Label>
                  <Select
                    value={agentConfig.analysisDepth}
                    onValueChange={(value) => setAgentConfig(prev => ({ ...prev, analysisDepth: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quick">{t('agents.quick')}</SelectItem>
                      <SelectItem value="balanced">{t('agents.balanced')}</SelectItem>
                      <SelectItem value="deep">{t('agents.deep')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Save Button */}
                <Button 
                  onClick={() => saveAgentConfig.mutate(agentConfig)}
                  disabled={saveAgentConfig.isPending}
                  className="w-full"
                >
                  {saveAgentConfig.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  {t('agents.saveConfig')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>


        {/* System Health */}
        <SystemHealth />
      </div>
    </div>
  );
}
