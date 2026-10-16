import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Tenant } from '../../common/decorators/tenant.decorator';
// Import nilai, bukan `import type`: Nest butuh metadata class untuk
// ValidationPipe, dan `import type` menghapusnya.
import { ClockDto, CreateDepartmentDto } from './dto/hr.dto';
import {
  AttendanceQueryDto,
  CreateAttendanceDto,
  CreateEmployeeDto,
  CreatePayrollDto,
  CreatePositionDto,
  DecideLeaveDto,
  LeaveRequestDto,
  ListLeavesQueryDto,
  TerminateEmployeeDto,
} from './dto/hr.dto';
import { HrmService } from './hrm.service';

@Controller('hrm')
export class HrmController {
  constructor(private readonly hrm: HrmService) {}

  @Get('departments')
  @RequirePermissions('settings:write')
  listDepartments(@Tenant() tenantId: string) {
    return this.hrm.listDepartments(tenantId);
  }

  @Get('positions')
  @RequirePermissions('settings:write')
  listPositions(@Tenant() tenantId: string) {
    return this.hrm.listPositions(tenantId);
  }

  @Post('positions')
  @RequirePermissions('settings:write')
  createPosition(@Tenant() tenantId: string, @Body() dto: CreatePositionDto) {
    return this.hrm.createPosition(tenantId, dto);
  }

  @Get('employees')
  @RequirePermissions('settings:write')
  listEmployees(@Tenant() tenantId: string) {
    return this.hrm.listEmployees(tenantId);
  }

  @Post('employees')
  @RequirePermissions('settings:write')
  createEmployee(@Tenant() tenantId: string, @Body() dto: CreateEmployeeDto) {
    return this.hrm.createEmployee(tenantId, dto);
  }

  @Post('employees/:id/terminate')
  @RequirePermissions('settings:write')
  terminate(
    @Tenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: TerminateEmployeeDto,
  ) {
    return this.hrm.terminate(tenantId, id, dto.date);
  }

  // ============================== ATTENDANCE & LEAVE ==============================

  @Post('attendance')
  @RequirePermissions('settings:write')
  recordAttendance(@Tenant() tenantId: string, @Body() dto: CreateAttendanceDto) {
    return this.hrm.recordAttendance(tenantId, dto);
  }

  @Get('attendance/summary')
  @RequirePermissions('settings:write')
  attendanceSummary(@Tenant() tenantId: string, @Query() query: AttendanceQueryDto) {
    return this.hrm.attendanceSummary(tenantId, query.month);
  }

  @Get('leaves')
  @RequirePermissions('settings:write')
  listLeaves(@Tenant() tenantId: string, @Query() query: ListLeavesQueryDto) {
    return this.hrm.listLeaves(tenantId, query.status);
  }

  @Post('leaves')
  @RequirePermissions('settings:write')
  requestLeave(@Tenant() tenantId: string, @Body() dto: LeaveRequestDto) {
    return this.hrm.requestLeave(tenantId, dto.employeeId, dto);
  }

  /** Saldo cuti tahunan (hak 12 hari kerja; terpakai/menunggu/sisa). */
  @Get('employees/:id/leave-balance')
  @RequirePermissions('settings:write')
  leaveBalance(@Tenant() tenantId: string, @Param('id') id: string, @Query('year') year?: string) {
    const y = year ? Number(year) : undefined;
    return this.hrm.leaveBalance(tenantId, id, y !== undefined && Number.isInteger(y) && y > 1970 && y < 2200 ? y : undefined);
  }

  @Post('leaves/:id/decide')
  @RequirePermissions('settings:write')
  decideLeave(
    @Tenant() tenantId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideLeaveDto,
  ) {
    return this.hrm.decideLeave(tenantId, id, user.sub, { approve: dto.approve });
  }

  // ============================== PAYROLL ==============================

  @Get('payroll/runs')
  @RequirePermissions('finance:read')
  listPayrollRuns(@Tenant() tenantId: string) {
    return this.hrm.listPayrollRuns(tenantId);
  }

  @Get('payroll/runs/:id')
  @RequirePermissions('finance:read')
  getPayrollRun(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.hrm.getPayrollRun(tenantId, id);
  }

  @Post('payroll/runs')
  @RequirePermissions('finance:write')
  runPayroll(@Tenant() tenantId: string, @Body() dto: CreatePayrollDto) {
    return this.hrm.runPayroll(tenantId, dto);
  }

  @Post('payroll/runs/:id/post')
  @RequirePermissions('finance:write')
  postPayroll(@Tenant() tenantId: string, @Param('id') id: string) {
    return this.hrm.postPayroll(tenantId, id);
  }

  @Post('departments')
  @RequirePermissions('settings:write')
  createDepartment(@Tenant() tenantId: string, @Body() dto: CreateDepartmentDto) {
    return this.hrm.createDepartment(tenantId, dto);
  }

  /** Absen masuk. Otomatis mencatat keterlambatan di luar masa tenggang. */
  @Post('attendance/:employeeId/clock-in')
  @RequirePermissions('settings:write')
  clockIn(@Tenant() tenantId: string, @Param('employeeId') employeeId: string, @Body() dto: ClockDto) {
    return this.hrm.clockIn(tenantId, employeeId, dto.at);
  }

  /** Absen pulang. Menghitung durasi kerja dan lembur. */
  @Post('attendance/:employeeId/clock-out')
  @RequirePermissions('settings:write')
  clockOut(@Tenant() tenantId: string, @Param('employeeId') employeeId: string, @Body() dto: ClockDto) {
    return this.hrm.clockOut(tenantId, employeeId, dto.at);
  }
}
