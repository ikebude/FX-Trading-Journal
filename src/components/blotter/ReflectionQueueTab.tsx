/**
 * ReflectionQueueTab — T3.6
 *
 * Shows unrefected closed trades from the last N hours.
 * Part of the Blotter page's tab system.
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDistanceToNow } from 'date-fns';

interface UnrefectedTrade {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  status: 'CLOSED' | 'CANCELLED';
  openedAtUtc: string;
  closedAtUtc: string;
  netPnl: number;
}

interface ReflectionQueueTabProps {
  /** Unrefected closed trades (typically from last 48h) */
  trades: UnrefectedTrade[];
  /** Called when user clicks "Add reflection" for a trade */
  onAddReflection: (tradeId: string) => void;
  /** Whether currently loading */
  isLoading?: boolean;
}

export function ReflectionQueueTab({
  trades,
  onAddReflection,
  isLoading = false,
}: ReflectionQueueTabProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-gray-500">Loading unrefected trades...</p>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40">
        <p className="text-sm text-gray-600">All trades reflected! 🎯</p>
        <p className="text-xs text-gray-400 mt-1">No unrefected trades from the last 48 hours.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        <p>
          <strong>{trades.length}</strong> unrefected trades from the last 48 hours
        </p>
        <p className="text-xs mt-1">
          Reflection helps reinforce learning and emotional awareness around each trade.
        </p>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-900">
              <TableHead>Symbol</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Closed</TableHead>
              <TableHead>P&L</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {trades.map((trade) => (
              <TableRow key={trade.id}>
                <TableCell className="font-semibold">{trade.symbol}</TableCell>
                <TableCell>
                  <Badge variant={trade.direction === 'LONG' ? 'default' : 'secondary'}>
                    {trade.direction}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-gray-500">
                  {trade.closedAtUtc
                    ? formatDistanceToNow(new Date(trade.closedAtUtc), { addSuffix: true })
                    : '—'}
                </TableCell>
                <TableCell
                  className={`font-semibold ${
                    trade.netPnl >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {trade.netPnl >= 0 ? '+' : ''}
                  {trade.netPnl.toFixed(2)}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onAddReflection(trade.id)}
                  >
                    Reflect
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
