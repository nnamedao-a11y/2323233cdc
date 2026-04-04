import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as ExcelJS from 'exceljs';
import { Lead } from '../leads/lead.schema';
import { Customer } from '../customers/customer.schema';
import { Deal } from '../deals/deal.schema';
import { Deposit } from '../deposits/deposit.schema';
import { Task } from '../tasks/task.schema';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction, EntityType } from '../../shared/enums';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(Customer.name) private customerModel: Model<Customer>,
    @InjectModel(Deal.name) private dealModel: Model<Deal>,
    @InjectModel(Deposit.name) private depositModel: Model<Deposit>,
    @InjectModel(Task.name) private taskModel: Model<Task>,
    private auditLogService: AuditLogService,
  ) {}

  async exportLeads(filters: any, userId: string): Promise<ExcelJS.Buffer> {
    const leads = await this.leadModel.find({ ...filters, isDeleted: false }).sort({ createdAt: -1 });
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ліди');

    // Columns
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 15 },
      { header: "Ім'я", key: 'firstName', width: 15 },
      { header: 'Прізвище', key: 'lastName', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Телефон', key: 'phone', width: 15 },
      { header: 'Компанія', key: 'company', width: 20 },
      { header: 'Статус', key: 'status', width: 15 },
      { header: 'Статус контакту', key: 'contactStatus', width: 18 },
      { header: 'Джерело', key: 'source', width: 15 },
      { header: 'Вартість', key: 'value', width: 12 },
      { header: 'Дата створення', key: 'createdAt', width: 18 },
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0A0A0B' },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Data
    leads.forEach((lead: any) => {
      worksheet.addRow({
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone || '',
        company: lead.company || '',
        status: lead.status,
        contactStatus: lead.contactStatus,
        source: lead.source,
        value: lead.value || 0,
        createdAt: lead.createdAt?.toISOString().split('T')[0],
      });
    });

    await this.auditLogService.log({
      action: AuditAction.EXPORT,
      entityType: EntityType.LEAD,
      entityId: 'bulk',
      userId,
      details: { count: leads.length, filters },
    });

    return await workbook.xlsx.writeBuffer();
  }

  async exportDeals(filters: any, userId: string): Promise<ExcelJS.Buffer> {
    const deals = await this.dealModel.find({ ...filters, isDeleted: false }).sort({ createdAt: -1 });
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Угоди');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 15 },
      { header: 'Назва', key: 'title', width: 30 },
      { header: 'Клієнт', key: 'customerId', width: 15 },
      { header: 'Статус', key: 'status', width: 15 },
      { header: 'Сума', key: 'value', width: 15 },
      { header: 'Очікувана дата закриття', key: 'expectedCloseDate', width: 20 },
      { header: 'Дата створення', key: 'createdAt', width: 18 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF16A34A' },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    deals.forEach((deal: any) => {
      worksheet.addRow({
        id: deal.id,
        title: deal.title,
        customerId: deal.customerId,
        status: deal.status,
        value: deal.value || 0,
        expectedCloseDate: deal.expectedCloseDate?.toISOString().split('T')[0] || '',
        createdAt: deal.createdAt?.toISOString().split('T')[0],
      });
    });

    await this.auditLogService.log({
      action: AuditAction.EXPORT,
      entityType: EntityType.DEAL,
      entityId: 'bulk',
      userId,
      details: { count: deals.length, filters },
    });

    return await workbook.xlsx.writeBuffer();
  }

  async exportDeposits(filters: any, userId: string): Promise<ExcelJS.Buffer> {
    const deposits = await this.depositModel.find({ ...filters, isDeleted: false }).sort({ createdAt: -1 });
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Депозити');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 15 },
      { header: 'Угода ID', key: 'dealId', width: 15 },
      { header: 'Клієнт ID', key: 'customerId', width: 15 },
      { header: 'Сума', key: 'amount', width: 15 },
      { header: 'Статус', key: 'status', width: 15 },
      { header: 'Метод оплати', key: 'paymentMethod', width: 15 },
      { header: 'Дата створення', key: 'createdAt', width: 18 },
      { header: 'Дата підтвердження', key: 'confirmedAt', width: 18 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF7C3AED' },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    deposits.forEach((deposit: any) => {
      worksheet.addRow({
        id: deposit.id,
        dealId: deposit.dealId,
        customerId: deposit.customerId,
        amount: deposit.amount || 0,
        status: deposit.status,
        paymentMethod: deposit.paymentMethod || '',
        createdAt: deposit.createdAt?.toISOString().split('T')[0],
        confirmedAt: deposit.confirmedAt?.toISOString().split('T')[0] || '',
      });
    });

    await this.auditLogService.log({
      action: AuditAction.EXPORT,
      entityType: EntityType.DEPOSIT,
      entityId: 'bulk',
      userId,
      details: { count: deposits.length, filters },
    });

    return await workbook.xlsx.writeBuffer();
  }

  async exportTasks(filters: any, userId: string): Promise<ExcelJS.Buffer> {
    const tasks = await this.taskModel.find({ ...filters, isDeleted: false }).sort({ dueDate: 1 });
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Завдання');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 15 },
      { header: 'Назва', key: 'title', width: 30 },
      { header: 'Опис', key: 'description', width: 40 },
      { header: 'Статус', key: 'status', width: 15 },
      { header: 'Пріоритет', key: 'priority', width: 12 },
      { header: 'Виконавець', key: 'assignedTo', width: 15 },
      { header: 'Термін', key: 'dueDate', width: 18 },
      { header: 'Дата створення', key: 'createdAt', width: 18 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEAB308' },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FF0A0A0B' } };

    tasks.forEach((task: any) => {
      worksheet.addRow({
        id: task.id,
        title: task.title,
        description: task.description || '',
        status: task.status,
        priority: task.priority,
        assignedTo: task.assignedTo || '',
        dueDate: task.dueDate?.toISOString().split('T')[0] || '',
        createdAt: task.createdAt?.toISOString().split('T')[0],
      });
    });

    await this.auditLogService.log({
      action: AuditAction.EXPORT,
      entityType: EntityType.TASK,
      entityId: 'bulk',
      userId,
      details: { count: tasks.length, filters },
    });

    return await workbook.xlsx.writeBuffer();
  }
}
