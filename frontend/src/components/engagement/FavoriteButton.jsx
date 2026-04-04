/**
 * FavoriteButton Component
 * 
 * ♥ В избранное / ♥ В избранном
 */

import React, { useState, useMemo } from 'react';
import { Heart } from '@phosphor-icons/react';
import { userEngagementApi } from '../../lib/api';

export default function FavoriteButton({ 
  vehicleId, 
  vin, 
  sourcePage,
  metadataSnapshot,
  favoriteSet = new Set(),
  onToggle,
  size = 'md',
  showText = true,
}) {
  const [saving, setSaving] = useState(false);
  const isFavorite = useMemo(() => favoriteSet.has(vehicleId), [favoriteSet, vehicleId]);

  async function handleClick(e) {
    e.stopPropagation();
    e.preventDefault();
    
    setSaving(true);
    try {
      if (isFavorite) {
        await userEngagementApi.favorites.remove(vehicleId);
      } else {
        await userEngagementApi.favorites.add({ 
          vehicleId, 
          vin, 
          sourcePage: sourcePage || window.location.pathname,
          metadataSnapshot,
        });
      }
      onToggle?.();
    } catch (err) {
      console.error('Favorite toggle error:', err);
    } finally {
      setSaving(false);
    }
  }

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base',
  };

  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;

  return (
    <button
      onClick={handleClick}
      disabled={saving}
      data-testid="favorite-button"
      className={`
        inline-flex items-center gap-2 rounded-lg border transition-all
        ${sizeClasses[size]}
        ${isFavorite 
          ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100' 
          : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300'
        }
        ${saving ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
      `}
    >
      <Heart 
        size={iconSize} 
        weight={isFavorite ? 'fill' : 'regular'}
        className={isFavorite ? 'text-rose-500' : 'text-zinc-400'}
      />
      {showText && (
        <span>{saving ? '...' : isFavorite ? 'В избранном' : 'В избранное'}</span>
      )}
    </button>
  );
}
