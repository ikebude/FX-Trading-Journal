/**
 * RitualChecklist — T3.6
 *
 * Pre-trade ritual checklist for a specific trade.
 * Mounted on TradeForm; blocks submission until all non-optional items checked.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';

interface RitualItem {
  id: string;
  text: string;
  optional?: boolean;
}

interface RitualChecklistProps {
  /** The ritual to display (or null if none applies) */
  ritual: {
    id: string;
    name: string;
    items: RitualItem[];
  } | null;

  /** Called when user wants to skip the ritual for this trade */
  onSkip: () => void;

  /** Called when all required items are checked */
  onComplete: () => void;

  /** Whether to show completion state */
  isComplete?: boolean;
}

export function RitualChecklist({
  ritual,
  onSkip,
  onComplete,
  isComplete = false,
}: RitualChecklistProps) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!ritual) return;

    // Check if all required items are checked
    const requiredItems = ritual.items.filter((item) => !item.optional);
    const allRequiredChecked = requiredItems.every((item) => checkedItems.has(item.id));

    if (allRequiredChecked) {
      onComplete();
    }
  }, [checkedItems, ritual, onComplete]);

  if (!ritual) {
    return null; // No ritual for this setup
  }

  const requiredCount = ritual.items.filter((item) => !item.optional).length;
  const checkedCount = Array.from(checkedItems).filter(
    (id) => !ritual.items.find((item) => item.id === id && item.optional),
  ).length;
  const isAllRequiredChecked = checkedCount === requiredCount;

  const toggleItem = (itemId: string) => {
    const next = new Set(checkedItems);
    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    setCheckedItems(next);
  };

  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{ritual.name}</CardTitle>
        <CardDescription className="text-xs">
          Complete all required items before submitting
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-2">
          {ritual.items.map((item) => (
            <div key={item.id} className="flex items-center space-x-2">
              <Checkbox
                id={`ritual-${item.id}`}
                checked={checkedItems.has(item.id)}
                onCheckedChange={() => toggleItem(item.id)}
              />
              <label
                htmlFor={`ritual-${item.id}`}
                className="text-sm cursor-pointer flex-1"
              >
                {item.text}
                {item.optional && <span className="text-xs text-gray-500 ml-1">(optional)</span>}
              </label>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSkip}
            className="flex-1"
          >
            Skip for this trade
          </Button>
          {isAllRequiredChecked && (
            <div className="flex-1 flex items-center justify-center text-xs text-green-600 dark:text-green-400">
              ✓ Ready to submit
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
