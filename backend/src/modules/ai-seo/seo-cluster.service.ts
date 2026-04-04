import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SeoCluster, SeoClusterDocument, ClusterType } from './schemas/seo-cluster.schema';
import { VehicleListing, VehicleListingDocument, ListingStatus } from '../publishing/schemas/vehicle-listing.schema';
import { v4 as uuidv4 } from 'uuid';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class SeoClusterService {
  private readonly logger = new Logger(SeoClusterService.name);

  constructor(
    @InjectModel(SeoCluster.name)
    private readonly clusterModel: Model<SeoClusterDocument>,
    @InjectModel('VehicleListing')
    private readonly listingModel: Model<VehicleListingDocument>,
  ) {}

  /**
   * Rebuild all clusters from published listings
   */
  async rebuildClusters(): Promise<{ created: number; updated: number }> {
    const listings = await this.listingModel.find({
      isPublished: true,
      status: ListingStatus.PUBLISHED,
      isDeleted: { $ne: true },
    }).lean();

    this.logger.log(`Rebuilding clusters for ${listings.length} listings`);

    let created = 0;
    let updated = 0;

    // Build brand clusters
    const brandResult = await this.buildBrandClusters(listings);
    created += brandResult.created;
    updated += brandResult.updated;

    // Build model clusters
    const modelResult = await this.buildModelClusters(listings);
    created += modelResult.created;
    updated += modelResult.updated;

    // Build budget clusters
    const budgetResult = await this.buildBudgetClusters(listings);
    created += budgetResult.created;
    updated += budgetResult.updated;

    // Build body type clusters
    const bodyResult = await this.buildBodyTypeClusters(listings);
    created += bodyResult.created;
    updated += bodyResult.updated;

    this.logger.log(`Clusters rebuilt: ${created} created, ${updated} updated`);
    return { created, updated };
  }

  private async buildBrandClusters(listings: any[]): Promise<{ created: number; updated: number }> {
    const groups = new Map<string, any[]>();

    for (const item of listings) {
      if (!item.make) continue;
      const key = String(item.make).toLowerCase().trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    let created = 0;
    let updated = 0;

    for (const [brand, items] of groups.entries()) {
      const slug = `cars-${slugify(brand)}`;
      const title = `${capitalize(brand)} з аукціонів США`;

      const existing = await this.clusterModel.findOne({ slug });

      const data = {
        slug,
        type: ClusterType.BRAND,
        title,
        description: `Добірка авто ${capitalize(brand)} з аукціонів США. ${items.length} авто в наявності.`,
        seoTitle: `${capitalize(brand)} з аукціонів США | BIBI Cars`,
        seoDescription: `Купити ${capitalize(brand)} з аукціонів Copart та IAAI. ${items.length} авто з доставкою в Україну.`,
        keywords: [brand, 'auction', 'usa', 'copart', 'iaai'],
        listingIds: items.map((x) => x.id || String(x._id)),
        listingCount: items.length,
        isPublished: items.length >= 1,
        publishedAt: new Date(),
        filters: { brand: capitalize(brand) },
      };

      if (existing) {
        await this.clusterModel.updateOne({ slug }, { $set: data });
        updated++;
      } else {
        await this.clusterModel.create({ id: uuidv4(), ...data });
        created++;
      }
    }

    return { created, updated };
  }

  private async buildModelClusters(listings: any[]): Promise<{ created: number; updated: number }> {
    const groups = new Map<string, any[]>();

    for (const item of listings) {
      if (!item.make || !item.model) continue;
      const key = `${String(item.make).toLowerCase()}-${slugify(String(item.model))}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    let created = 0;
    let updated = 0;

    for (const [key, items] of groups.entries()) {
      if (items.length < 1) continue;

      const sample = items[0];
      const slug = `cars-${key}`;
      const title = `${sample.make} ${sample.model} з аукціонів`;

      const existing = await this.clusterModel.findOne({ slug });

      const data = {
        slug,
        type: ClusterType.MODEL,
        title,
        description: `Добірка ${sample.make} ${sample.model} з аукціонів.`,
        seoTitle: `${sample.make} ${sample.model} з аукціонів США | BIBI Cars`,
        seoDescription: `Актуальні ${sample.make} ${sample.model} з доставкою в Україну. ${items.length} авто.`,
        keywords: [sample.make?.toLowerCase(), sample.model?.toLowerCase(), 'auction', 'usa'].filter(Boolean),
        listingIds: items.map((x) => x.id || String(x._id)),
        listingCount: items.length,
        isPublished: true,
        publishedAt: new Date(),
        filters: { brand: sample.make, model: sample.model },
      };

      if (existing) {
        await this.clusterModel.updateOne({ slug }, { $set: data });
        updated++;
      } else {
        await this.clusterModel.create({ id: uuidv4(), ...data });
        created++;
      }
    }

    return { created, updated };
  }

  private async buildBudgetClusters(listings: any[]): Promise<{ created: number; updated: number }> {
    const tiers = [
      { slug: 'under-5000', title: 'Авто до $5,000', min: 0, max: 5000 },
      { slug: '5000-10000', title: 'Авто $5,000–10,000', min: 5000, max: 10000 },
      { slug: '10000-20000', title: 'Авто $10,000–20,000', min: 10000, max: 20000 },
      { slug: '20000-30000', title: 'Авто $20,000–30,000', min: 20000, max: 30000 },
      { slug: 'over-30000', title: 'Авто від $30,000', min: 30000, max: Infinity },
    ];

    let created = 0;
    let updated = 0;

    for (const tier of tiers) {
      const items = listings.filter((x) => {
        const price = Number(x.currentBid || x.buyNowPrice || x.estimatedRetail || 0);
        return price >= tier.min && price < tier.max;
      });

      if (items.length < 1) continue;

      const slug = `cars-${tier.slug}`;
      const existing = await this.clusterModel.findOne({ slug });

      const data = {
        slug,
        type: ClusterType.BUDGET,
        title: tier.title,
        description: `${tier.title} з аукціонів США. ${items.length} авто в наявності.`,
        seoTitle: `${tier.title} | Авто з аукціонів США`,
        seoDescription: `Добірка авто ${tier.title.toLowerCase()} з доставкою в Україну.`,
        keywords: ['budget', 'cheap cars', 'auction', 'usa'],
        listingIds: items.map((x) => x.id || String(x._id)),
        listingCount: items.length,
        isPublished: true,
        publishedAt: new Date(),
        filters: { minPrice: tier.min, maxPrice: tier.max === Infinity ? undefined : tier.max },
      };

      if (existing) {
        await this.clusterModel.updateOne({ slug }, { $set: data });
        updated++;
      } else {
        await this.clusterModel.create({ id: uuidv4(), ...data });
        created++;
      }
    }

    return { created, updated };
  }

  private async buildBodyTypeClusters(listings: any[]): Promise<{ created: number; updated: number }> {
    const groups = new Map<string, any[]>();

    for (const item of listings) {
      if (!item.bodyType) continue;
      const key = String(item.bodyType).toLowerCase().trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    let created = 0;
    let updated = 0;

    for (const [bodyType, items] of groups.entries()) {
      if (items.length < 1) continue;

      const slug = `cars-${slugify(bodyType)}`;
      const title = `${capitalize(bodyType)} з аукціонів`;

      const existing = await this.clusterModel.findOne({ slug });

      const data = {
        slug,
        type: ClusterType.BODY_TYPE,
        title,
        description: `Добірка ${bodyType} з аукціонів США.`,
        seoTitle: `${capitalize(bodyType)} з аукціонів США | BIBI Cars`,
        seoDescription: `Купити ${bodyType} з аукціонів. ${items.length} авто з доставкою.`,
        keywords: [bodyType, 'auction', 'usa'],
        listingIds: items.map((x) => x.id || String(x._id)),
        listingCount: items.length,
        isPublished: true,
        publishedAt: new Date(),
        filters: { bodyType: capitalize(bodyType) },
      };

      if (existing) {
        await this.clusterModel.updateOne({ slug }, { $set: data });
        updated++;
      } else {
        await this.clusterModel.create({ id: uuidv4(), ...data });
        created++;
      }
    }

    return { created, updated };
  }

  // ============ PUBLIC API ============

  async getPublicClusters(type?: ClusterType) {
    const filter: any = { isPublished: true, listingCount: { $gt: 0 } };
    if (type) filter.type = type;

    return this.clusterModel
      .find(filter)
      .sort({ listingCount: -1 })
      .lean();
  }

  async getClusterBySlug(slug: string) {
    const cluster = await this.clusterModel.findOne({
      slug,
      isPublished: true,
    }).lean();

    if (!cluster) return null;

    // Increment view count
    await this.clusterModel.updateOne({ slug }, { $inc: { viewCount: 1 } });

    // Get listings
    const listings = await this.listingModel.find({
      $or: [
        { id: { $in: cluster.listingIds } },
        { _id: { $in: cluster.listingIds } },
      ],
      isPublished: true,
      status: ListingStatus.PUBLISHED,
      isDeleted: { $ne: true },
    }).lean();

    return {
      cluster,
      listings,
    };
  }
}
