/**
 * AccountFormFields — Reusable form fields for account creation/edit
 *
 * Provides controlled inputs for all account fields:
 * - Basic: name, broker, currency, balance, type, color
 * - Metadata: server, platform, leverage, timezone, login, brokerType
 * - Prop firm: daily loss, max drawdown, profit target, phase (conditional)
 */

import { useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  Palette,
  Calendar,
} from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { CreateAccountInput } from '@/lib/schemas';

// IANA timezones (subset for autocomplete)
const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

const PLATFORMS = ['MT4', 'MT5', 'cTrader', 'MatchTrader', 'DXtrade', 'IBKR', 'OANDA', 'CRYPTO', 'OTHER'] as const;
const BROKER_TYPES = ['RETAIL', 'PROP', 'ECN', 'MARKET_MAKER', 'CRYPTO_EXCHANGE'] as const;
const DRAWDOWN_TYPES = ['STATIC', 'TRAILING'] as const;
const PHASES = ['PHASE_1', 'PHASE_2', 'FUNDED', 'VERIFIED'] as const;

export interface AccountFormFieldsProps {
  data: Partial<CreateAccountInput>;
  onChange: (field: keyof CreateAccountInput, value: any) => void;
  errors?: Record<string, string>;
}

export function AccountFormFields({ data, onChange, errors = {} }: AccountFormFieldsProps) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState('');
  
  const isProp = data.accountType === 'PROP';
  const filteredTimezones = TIMEZONES.filter((tz) =>
    tz.toLowerCase().includes(timezoneSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── Basic Section ────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Basic Info
        </h3>

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name" className="text-xs font-medium">
            Account Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            placeholder="e.g., FTMO Live Account"
            value={data.name ?? ''}
            onChange={(e) => onChange('name', e.target.value)}
            className={cn(errors.name && 'border-destructive')}
          />
          {errors.name && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.name}
            </span>
          )}
        </div>

        {/* Broker */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="broker" className="text-xs font-medium">
            Broker
          </Label>
          <Input
            id="broker"
            placeholder="e.g., FTMO, IC Markets, Darwinex"
            value={data.broker ?? ''}
            onChange={(e) => onChange('broker', e.target.value)}
          />
        </div>

        {/* Currency */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currency" className="text-xs font-medium">
            Currency <span className="text-destructive">*</span>
          </Label>
          <Input
            id="currency"
            placeholder="USD"
            maxLength={3}
            value={data.accountCurrency ?? 'USD'}
            onChange={(e) => onChange('accountCurrency', e.target.value.toUpperCase())}
            className={cn(errors.accountCurrency && 'border-destructive')}
          />
          {errors.accountCurrency && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.accountCurrency}
            </span>
          )}
        </div>

        {/* Initial Balance */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="balance" className="text-xs font-medium">
            Initial Balance <span className="text-destructive">*</span>
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {data.accountCurrency ?? 'USD'}
            </span>
            <Input
              id="balance"
              type="number"
              step="0.01"
              placeholder="10000"
              value={data.initialBalance ?? ''}
              onChange={(e) => onChange('initialBalance', parseFloat(e.target.value) || 0)}
              className="flex-1"
            />
          </div>
        </div>

        {/* Account Type */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Account Type</Label>
          <div className="flex gap-2">
            {(['LIVE', 'DEMO', 'PROP'] as const).map((type) => (
              <Button
                key={type}
                type="button"
                variant={data.accountType === type ? 'default' : 'outline'}
                size="sm"
                onClick={() => onChange('accountType', type)}
              >
                {type}
              </Button>
            ))}
          </div>
        </div>

        {/* Display Color */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Display Color</Label>
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded border border-border cursor-pointer"
              style={{ backgroundColor: data.displayColor ?? '#3b82f6' }}
              onClick={() => setColorPickerOpen(!colorPickerOpen)}
            />
            <Input
              type="text"
              placeholder="#3b82f6"
              value={data.displayColor ?? ''}
              onChange={(e) => onChange('displayColor', e.target.value)}
              className="flex-1 font-mono text-xs"
            />
          </div>
          {colorPickerOpen && (
            <div className="grid grid-cols-6 gap-2">
              {[
                '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6',
                '#8b5cf6', '#ec4899', '#6b7280', '#64748b',
              ].map((color) => (
                <button
                  key={color}
                  className="h-6 w-6 rounded border-2 border-transparent hover:border-foreground"
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    onChange('displayColor', color);
                    setColorPickerOpen(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Opened At */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="opened-at" className="text-xs font-medium">
            Opened At (UTC)
          </Label>
          <Input
            id="opened-at"
            type="datetime-local"
            value={data.openedAtUtc ? data.openedAtUtc.slice(0, 16) : ''}
            onChange={(e) => {
              if (e.target.value) {
                const iso = new Date(e.target.value).toISOString();
                onChange('openedAtUtc', iso);
              } else {
                onChange('openedAtUtc', undefined);
              }
            }}
          />
        </div>
      </div>

      {/* ── Broker Metadata Section ────────────────────────────────────── */}
      <div className="space-y-4 border-t border-border pt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Broker Metadata (Optional)
        </h3>

        {/* Server */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="server" className="text-xs font-medium">
            Server
          </Label>
          <Input
            id="server"
            placeholder="e.g., 'FTMO-Live', 'ICM.1', 'OandaV20'"
            value={data.server ?? ''}
            onChange={(e) => onChange('server', e.target.value)}
          />
        </div>

        {/* Platform */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="platform" className="text-xs font-medium">
            Platform
          </Label>
          <Select value={data.platform ?? ''} onValueChange={(v) => onChange('platform', v || undefined)}>
            <SelectTrigger id="platform">
              <SelectValue placeholder="Select platform" />
            </SelectTrigger>
            <SelectContent>
              {PLATFORMS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Leverage */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="leverage" className="text-xs font-medium">
            Leverage
          </Label>
          <Input
            id="leverage"
            type="number"
            step="1"
            placeholder="100"
            min="1"
            value={data.leverage ?? ''}
            onChange={(e) => onChange('leverage', e.target.value ? parseInt(e.target.value) : undefined)}
          />
        </div>

        {/* Timezone */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="timezone" className="text-xs font-medium">
            Timezone (IANA)
          </Label>
          <Select value={data.timezone ?? ''} onValueChange={(v) => onChange('timezone', v || undefined)}>
            <SelectTrigger id="timezone">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              {filteredTimezones.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Login */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login" className="text-xs font-medium">
            Login / Account Number
          </Label>
          <Input
            id="login"
            placeholder="e.g., '123456789'"
            value={data.login ?? ''}
            onChange={(e) => onChange('login', e.target.value)}
          />
        </div>

        {/* Broker Type */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="broker-type" className="text-xs font-medium">
            Broker Type
          </Label>
          <Select value={data.brokerType ?? ''} onValueChange={(v) => onChange('brokerType', v || undefined)}>
            <SelectTrigger id="broker-type">
              <SelectValue placeholder="Select broker type" />
            </SelectTrigger>
            <SelectContent>
              {BROKER_TYPES.map((bt) => (
                <SelectItem key={bt} value={bt}>
                  {bt.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Prop Firm Section (Conditional) ────────────────────────────────────── */}
      {isProp && (
        <div className="space-y-4 border-t border-border pt-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Prop Firm Rules
          </h3>

          {/* Daily Loss Limit */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="daily-loss" className="text-xs font-medium">
                Daily Loss Limit
              </Label>
              <Input
                id="daily-loss"
                type="number"
                step="0.01"
                placeholder="1000"
                value={data.propDailyLossLimit ?? ''}
                onChange={(e) => onChange('propDailyLossLimit', parseFloat(e.target.value) || undefined)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="daily-loss-pct" className="text-xs font-medium">
                Daily Loss %
              </Label>
              <Input
                id="daily-loss-pct"
                type="number"
                step="0.01"
                placeholder="5"
                min="0"
                max="100"
                value={data.propDailyLossPct ?? ''}
                onChange={(e) => onChange('propDailyLossPct', parseFloat(e.target.value) || undefined)}
              />
            </div>
          </div>

          {/* Max Drawdown */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="max-dd" className="text-xs font-medium">
                Max Drawdown
              </Label>
              <Input
                id="max-dd"
                type="number"
                step="0.01"
                placeholder="2000"
                value={data.propMaxDrawdown ?? ''}
                onChange={(e) => onChange('propMaxDrawdown', parseFloat(e.target.value) || undefined)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="max-dd-pct" className="text-xs font-medium">
                Max DD %
              </Label>
              <Input
                id="max-dd-pct"
                type="number"
                step="0.01"
                placeholder="10"
                min="0"
                max="100"
                value={data.propMaxDrawdownPct ?? ''}
                onChange={(e) => onChange('propMaxDrawdownPct', parseFloat(e.target.value) || undefined)}
              />
            </div>
          </div>

          {/* Drawdown Type */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dd-type" className="text-xs font-medium">
              Drawdown Type
            </Label>
            <Select value={data.propDrawdownType ?? ''} onValueChange={(v) => onChange('propDrawdownType', v || undefined)}>
              <SelectTrigger id="dd-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {DRAWDOWN_TYPES.map((dt) => (
                  <SelectItem key={dt} value={dt}>
                    {dt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Profit Target */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profit-target" className="text-xs font-medium">
                Profit Target
              </Label>
              <Input
                id="profit-target"
                type="number"
                step="0.01"
                placeholder="5000"
                value={data.propProfitTarget ?? ''}
                onChange={(e) => onChange('propProfitTarget', parseFloat(e.target.value) || undefined)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profit-pct" className="text-xs font-medium">
                Profit Target %
              </Label>
              <Input
                id="profit-pct"
                type="number"
                step="0.01"
                placeholder="10"
                min="0"
                max="100"
                value={data.propProfitTargetPct ?? ''}
                onChange={(e) => onChange('propProfitTargetPct', parseFloat(e.target.value) || undefined)}
              />
            </div>
          </div>

          {/* Phase */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phase" className="text-xs font-medium">
              Phase
            </Label>
            <Select value={data.propPhase ?? ''} onValueChange={(v) => onChange('propPhase', v || undefined)}>
              <SelectTrigger id="phase">
                <SelectValue placeholder="Select phase" />
              </SelectTrigger>
              <SelectContent>
                {PHASES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
