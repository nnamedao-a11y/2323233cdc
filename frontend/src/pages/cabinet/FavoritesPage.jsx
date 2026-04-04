/**
 * Favorites Page (Customer Cabinet)
 * 
 * /cabinet/:customerId/favorites
 */

import React from 'react';
import { Heart, Trash, Eye, Scales } from '@phosphor-icons/react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFavorites } from '../../hooks/useFavorites';
import { useCompare } from '../../hooks/useCompare';
import { useLang } from '../../i18n';

export default function FavoritesPage() {
  const navigate = useNavigate();
  const { customerId } = useParams();
  const { t } = useLang();
  const { items, loading, remove, vehicleSet: favoriteSet } = useFavorites();
  const { add: addToCompare, vehicleSet: compareSet, count: compareCount } = useCompare();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#18181B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-rose-100">
            <Heart size={24} weight="fill" className="text-rose-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#18181B]">Обране</h1>
            <p className="text-[#71717A]">{items.length} автомобілів</p>
          </div>
        </div>
        
        {compareCount > 0 && (
          <button
            onClick={() => navigate(`/cabinet/${customerId}/compare`)}
            className="px-4 py-2 rounded-xl bg-blue-100 text-blue-600 font-medium 
                       hover:bg-blue-200 transition-colors flex items-center gap-2"
          >
            <Scales size={18} />
            Порівняти ({compareCount})
          </button>
        )}
      </div>

      {/* Empty State */}
      {!items.length && (
        <div className="rounded-2xl border-2 border-dashed border-[#E4E4E7] bg-white p-12 text-center">
          <Heart size={48} className="mx-auto mb-4 text-[#D4D4D8]" />
          <h3 className="text-lg font-semibold text-[#18181B] mb-2">
            Немає обраних автомобілів
          </h3>
          <p className="text-[#71717A] mb-6">
            Додайте автомобілі в обране, щоб відслідковувати їх
          </p>
          <button
            onClick={() => navigate('/vin-search')}
            className="px-6 py-3 rounded-xl bg-[#18181B] text-white font-medium hover:bg-[#27272A]"
          >
            Знайти авто
          </button>
        </div>
      )}

      {/* Favorites List */}
      <div className="space-y-4">
        {items.map((item) => (
          <div 
            key={item._id}
            className="rounded-2xl border border-[#E4E4E7] bg-white p-5 
                       hover:border-[#18181B] hover:shadow-sm transition-all"
            data-testid={`favorite-item-${item.vehicleId}`}
          >
            <div className="flex items-start justify-between gap-4">
              {/* Info */}
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-[#18181B]">
                  {item.metadataSnapshot?.title || item.vin}
                </h3>
                <p className="text-[#71717A] text-sm mt-1">
                  VIN: {item.vin}
                </p>
                {item.metadataSnapshot?.price && (
                  <p className="text-emerald-600 font-semibold mt-2">
                    ${item.metadataSnapshot.price.toLocaleString()}
                  </p>
                )}
                <p className="text-[#A1A1AA] text-xs mt-2">
                  Додано: {new Date(item.createdAt).toLocaleDateString('uk-UA')}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {!compareSet.has(item.vehicleId) && compareCount < 3 && (
                  <button
                    onClick={() => addToCompare({ 
                      vehicleId: item.vehicleId, 
                      vin: item.vin,
                      snapshot: item.metadataSnapshot,
                    })}
                    className="p-2 rounded-lg border border-[#E4E4E7] hover:bg-[#F4F4F5] 
                               text-[#71717A] hover:text-blue-600 transition-colors"
                    title="Додати до порівняння"
                    data-testid={`compare-btn-${item.vehicleId}`}
                  >
                    <Scales size={20} />
                  </button>
                )}
                <button
                  onClick={() => navigate(`/vin-search?vin=${item.vin}`)}
                  className="p-2 rounded-lg border border-[#E4E4E7] hover:bg-[#F4F4F5] 
                             text-[#71717A] hover:text-[#18181B] transition-colors"
                  title="Відкрити"
                >
                  <Eye size={20} />
                </button>
                <button
                  onClick={() => remove(item.vehicleId)}
                  className="p-2 rounded-lg border border-[#E4E4E7] hover:bg-red-50 
                             text-[#71717A] hover:text-red-600 transition-colors"
                  title="Видалити"
                  data-testid={`remove-btn-${item.vehicleId}`}
                >
                  <Trash size={20} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
