import { Pool } from 'pg';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  role: string;
  phoneNumber: string;
  status: 'Active' | 'Inactive';
}

export interface Shift {
  id: string;
  shiftName: string;
  startTime: string; // 'HH:MM'
  endTime: string;   // 'HH:MM'
  breakMinutes: number;
  shiftHours: number; // computed
}

export interface ShiftSchedule {
  id: string;
  employeeId: string;
  employeeName: string;
  shiftId: string;
  shiftName: string;
  shiftDate: string;
  assignedBy: string;
  remarks: string;
}

export interface EmployeeAvailability {
  id: string;
  employeeId: string;
  employeeName: string;
  availableFrom: string;
  availableTo: string;
  status: 'Available' | 'Unavailable';
  remarks: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  attendanceDate: string;
  checkIn: string;
  checkOut: string;
  breakMinutes: number;
  workingHours: number;
  overtimeHours: number;
  lateMinutes: number;
  attendanceStatus: 'Present' | 'Absent' | 'Leave' | 'Half-Day';
  markedBy: string;
  shiftName?: string;
  shiftStartTime?: string;
  shiftHours?: number;
}

export interface PayrollSummary {
  id: string;
  employeeId: string;
  employeeName: string;
  month: string; // 'YYYY-MM'
  workingDays: number;
  workingHours: number;
  overtimeHours: number;
  leaveDays: number;
  generatedOn: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert 'HH:MM' to total minutes since midnight */
function timeToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Shift duration in hours (handles overnight shifts) */
function shiftHours(startTime: string, endTime: string, breakMinutes: number): number {
  let diff = timeToMinutes(endTime) - timeToMinutes(startTime);
  if (diff < 0) diff += 24 * 60; // overnight
  return Math.max(0, (diff - breakMinutes) / 60);
}

/** Working hours from check-in/out times */
function calcWorkingHours(checkIn: string, checkOut: string, breakMinutes: number): number {
  if (!checkIn || !checkOut) return 0;
  let diff = timeToMinutes(checkOut) - timeToMinutes(checkIn);
  if (diff < 0) diff += 24 * 60;
  return Math.max(0, (diff - breakMinutes) / 60);
}

/** Late minutes: how many minutes after shift start the employee clocked in */
function calcLateMinutes(shiftStartTime: string, checkIn: string): number {
  if (!shiftStartTime || !checkIn) return 0;
  return Math.max(0, timeToMinutes(checkIn) - timeToMinutes(shiftStartTime));
}

// ── Store ─────────────────────────────────────────────────────────────────────

export class StaffDbStore {
  constructor(private readonly pool: Pool) {}

  async initialize() {
    // employees
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        employee_code TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        phone_number TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Active'
      )
    `);

    // shifts
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS shifts (
        id TEXT PRIMARY KEY,
        shift_name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        break_minutes INT NOT NULL DEFAULT 30
      )
    `);

    // shift_schedule
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS shift_schedule (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        shift_id TEXT NOT NULL,
        shift_date TEXT NOT NULL,
        assigned_by TEXT NOT NULL DEFAULT 'Manager',
        remarks TEXT NOT NULL DEFAULT ''
      )
    `);

    // employee_availability
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS employee_availability (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        available_from TEXT NOT NULL,
        available_to TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Available',
        remarks TEXT NOT NULL DEFAULT ''
      )
    `);

    // leave_requests
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        leave_type TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Pending',
        approved_by TEXT NOT NULL DEFAULT ''
      )
    `);

    // attendance
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        attendance_date TEXT NOT NULL,
        check_in TEXT NOT NULL DEFAULT '',
        check_out TEXT NOT NULL DEFAULT '',
        break_minutes INT NOT NULL DEFAULT 30,
        working_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
        overtime_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
        late_minutes INT NOT NULL DEFAULT 0,
        attendance_status TEXT NOT NULL DEFAULT 'Present',
        marked_by TEXT NOT NULL DEFAULT 'Manager',
        shift_id TEXT NOT NULL DEFAULT ''
      )
    `);

    // payroll_summary
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS payroll_summary (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        month TEXT NOT NULL,
        working_days INT NOT NULL DEFAULT 0,
        working_hours NUMERIC(7,2) NOT NULL DEFAULT 0,
        overtime_hours NUMERIC(7,2) NOT NULL DEFAULT 0,
        leave_days INT NOT NULL DEFAULT 0,
        generated_on TEXT NOT NULL
      )
    `);

    // Seed data if empty
    const empCount = await this.pool.query('SELECT COUNT(*)::int AS count FROM employees');
    if ((empCount.rows[0]?.count ?? 0) === 0) {
      const today = new Date().toISOString().split('T')[0];

      await this.pool.query(`
        INSERT INTO employees (id, employee_code, full_name, role, phone_number, status) VALUES
        ('emp1','E001','John Smith','Chef','9876540001','Active'),
        ('emp2','E002','Priya Nair','Waitstaff','9876540002','Active'),
        ('emp3','E003','Rahul Gupta','Cashier','9876540003','Active'),
        ('emp4','E004','Sara Khan','Hostess','9876540004','Active'),
        ('emp5','E005','David Lee','Kitchen Assistant','9876540005','Active')
      `);

      await this.pool.query(`
        INSERT INTO shifts (id, shift_name, start_time, end_time, break_minutes) VALUES
        ('sh1','Morning','09:00','17:00',60),
        ('sh2','Evening','14:00','22:00',60),
        ('sh3','Night','22:00','06:00',30),
        ('sh4','Split','10:00','15:00',0)
      `);

      // Sample schedules for today and yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yd = yesterday.toISOString().split('T')[0];

      await this.pool.query(`
        INSERT INTO shift_schedule (id, employee_id, shift_id, shift_date, assigned_by, remarks) VALUES
        ('ss1','emp1','sh1',$1,'Manager',''),
        ('ss2','emp2','sh2',$1,'Manager',''),
        ('ss3','emp3','sh1',$1,'Manager',''),
        ('ss4','emp1','sh1',$2,'Manager',''),
        ('ss5','emp4','sh2',$2,'Manager','')
      `, [today, yd]);

      // Sample attendance for yesterday
      await this.pool.query(`
        INSERT INTO attendance (id, employee_id, attendance_date, check_in, check_out, break_minutes, working_hours, overtime_hours, late_minutes, attendance_status, marked_by, shift_id) VALUES
        ('att1','emp1',$1,'09:05','17:30',60,7.42,0.42,5,'Present','Manager','sh1'),
        ('att2','emp2',$1,'14:18','22:10',60,7.87,0,18,'Present','Manager','sh2'),
        ('att3','emp3',$1,'09:00','17:00',60,7.0,0,0,'Present','Manager','sh1'),
        ('att4','emp4',$1,'','',0,0,0,0,'Absent','Manager','sh2')
      `, [yd]);

      // Sample leave
      await this.pool.query(`
        INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, reason, status, approved_by) VALUES
        ('lr1','emp3','Sick Leave',$1,$1,'Fever','Approved','Manager'),
        ('lr2','emp5','Casual Leave',$2,$2,'Personal work','Pending','')
      `, [yd, today]);

      // Sample availability
      await this.pool.query(`
        INSERT INTO employee_availability (id, employee_id, available_from, available_to, status, remarks) VALUES
        ('av1','emp1','2026-01-01','2026-12-31','Available','Available Mon-Sat'),
        ('av2','emp5',$1,$1,'Unavailable','Personal appointment')
      `, [today]);
    }
  }

  // ── Employees ───────────────────────────────────────────────────────────────

  async getEmployees(): Promise<Employee[]> {
    const r = await this.pool.query(
      `SELECT id, employee_code AS "employeeCode", full_name AS "fullName",
              role, phone_number AS "phoneNumber", status
       FROM employees ORDER BY full_name`
    );
    return r.rows as Employee[];
  }

  async addEmployee(data: { employeeCode: string; fullName: string; role: string; phoneNumber: string }): Promise<Employee> {
    const id = `emp${Date.now()}`;
    await this.pool.query(
      `INSERT INTO employees (id, employee_code, full_name, role, phone_number, status) VALUES ($1,$2,$3,$4,$5,'Active')`,
      [id, data.employeeCode, data.fullName, data.role, data.phoneNumber || '']
    );
    return { id, ...data, status: 'Active' };
  }

  async updateEmployeeStatus(id: string, status: 'Active' | 'Inactive'): Promise<void> {
    await this.pool.query('UPDATE employees SET status = $1 WHERE id = $2', [status, id]);
  }

  // ── Shifts ──────────────────────────────────────────────────────────────────

  async getShifts(): Promise<Shift[]> {
    const r = await this.pool.query(
      `SELECT id, shift_name AS "shiftName", start_time AS "startTime",
              end_time AS "endTime", break_minutes AS "breakMinutes"
       FROM shifts ORDER BY start_time`
    );
    return r.rows.map((row: any) => ({
      ...row,
      shiftHours: shiftHours(row.startTime, row.endTime, row.breakMinutes),
    })) as Shift[];
  }

  async addShift(data: { shiftName: string; startTime: string; endTime: string; breakMinutes: number }): Promise<Shift> {
    const id = `sh${Date.now()}`;
    await this.pool.query(
      `INSERT INTO shifts (id, shift_name, start_time, end_time, break_minutes) VALUES ($1,$2,$3,$4,$5)`,
      [id, data.shiftName, data.startTime, data.endTime, data.breakMinutes]
    );
    return { id, ...data, shiftHours: shiftHours(data.startTime, data.endTime, data.breakMinutes) };
  }

  // ── Shift Schedule ──────────────────────────────────────────────────────────

  async getShiftSchedule(params?: { dateFrom?: string; dateTo?: string }): Promise<ShiftSchedule[]> {
    let whereClause = '';
    const values: string[] = [];
    if (params?.dateFrom && params?.dateTo) {
      whereClause = 'WHERE ss.shift_date BETWEEN $1 AND $2';
      values.push(params.dateFrom, params.dateTo);
    } else if (params?.dateFrom) {
      whereClause = 'WHERE ss.shift_date = $1';
      values.push(params.dateFrom);
    }

    const r = await this.pool.query(
      `SELECT ss.id, ss.employee_id AS "employeeId", e.full_name AS "employeeName",
              ss.shift_id AS "shiftId", s.shift_name AS "shiftName",
              ss.shift_date AS "shiftDate", ss.assigned_by AS "assignedBy", ss.remarks
       FROM shift_schedule ss
       JOIN employees e ON e.id = ss.employee_id
       JOIN shifts s ON s.id = ss.shift_id
       ${whereClause}
       ORDER BY ss.shift_date DESC, s.start_time`,
      values
    );
    return r.rows as ShiftSchedule[];
  }

  async assignShift(data: {
    employeeId: string; shiftId: string; shiftDate: string;
    assignedBy: string; remarks: string;
  }): Promise<ShiftSchedule> {
    const id = `ss${Date.now()}`;
    // Remove any existing assignment for same employee+date
    await this.pool.query(
      'DELETE FROM shift_schedule WHERE employee_id = $1 AND shift_date = $2',
      [data.employeeId, data.shiftDate]
    );
    await this.pool.query(
      `INSERT INTO shift_schedule (id, employee_id, shift_id, shift_date, assigned_by, remarks) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, data.employeeId, data.shiftId, data.shiftDate, data.assignedBy || 'Manager', data.remarks || '']
    );
    // Get full details to return
    const r = await this.pool.query(
      `SELECT ss.id, ss.employee_id AS "employeeId", e.full_name AS "employeeName",
              ss.shift_id AS "shiftId", s.shift_name AS "shiftName",
              ss.shift_date AS "shiftDate", ss.assigned_by AS "assignedBy", ss.remarks
       FROM shift_schedule ss
       JOIN employees e ON e.id = ss.employee_id
       JOIN shifts s ON s.id = ss.shift_id
       WHERE ss.id = $1`,
      [id]
    );
    return r.rows[0] as ShiftSchedule;
  }

  async deleteShiftAssignment(id: string): Promise<void> {
    await this.pool.query('DELETE FROM shift_schedule WHERE id = $1', [id]);
  }

  // ── Availability ────────────────────────────────────────────────────────────

  async getAvailability(): Promise<EmployeeAvailability[]> {
    const r = await this.pool.query(
      `SELECT ea.id, ea.employee_id AS "employeeId", e.full_name AS "employeeName",
              ea.available_from AS "availableFrom", ea.available_to AS "availableTo",
              ea.status, ea.remarks
       FROM employee_availability ea
       JOIN employees e ON e.id = ea.employee_id
       ORDER BY ea.available_from DESC`
    );
    return r.rows as EmployeeAvailability[];
  }

  async addAvailability(data: {
    employeeId: string; availableFrom: string; availableTo: string;
    status: 'Available' | 'Unavailable'; remarks: string;
  }): Promise<EmployeeAvailability> {
    const id = `av${Date.now()}`;
    await this.pool.query(
      `INSERT INTO employee_availability (id, employee_id, available_from, available_to, status, remarks) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, data.employeeId, data.availableFrom, data.availableTo, data.status, data.remarks || '']
    );
    const r = await this.pool.query(
      `SELECT ea.id, ea.employee_id AS "employeeId", e.full_name AS "employeeName",
              ea.available_from AS "availableFrom", ea.available_to AS "availableTo",
              ea.status, ea.remarks
       FROM employee_availability ea
       JOIN employees e ON e.id = ea.employee_id
       WHERE ea.id = $1`, [id]
    );
    return r.rows[0] as EmployeeAvailability;
  }

  // ── Leave Requests ──────────────────────────────────────────────────────────

  async getLeaveRequests(): Promise<LeaveRequest[]> {
    const r = await this.pool.query(
      `SELECT lr.id, lr.employee_id AS "employeeId", e.full_name AS "employeeName",
              lr.leave_type AS "leaveType", lr.start_date AS "startDate",
              lr.end_date AS "endDate", lr.reason, lr.status, lr.approved_by AS "approvedBy"
       FROM leave_requests lr
       JOIN employees e ON e.id = lr.employee_id
       ORDER BY lr.start_date DESC`
    );
    return r.rows as LeaveRequest[];
  }

  async addLeaveRequest(data: {
    employeeId: string; leaveType: string; startDate: string;
    endDate: string; reason: string;
  }): Promise<LeaveRequest> {
    const id = `lr${Date.now()}`;
    await this.pool.query(
      `INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, reason, status, approved_by) VALUES ($1,$2,$3,$4,$5,$6,'Pending','')`,
      [id, data.employeeId, data.leaveType, data.startDate, data.endDate, data.reason || '']
    );
    const r = await this.pool.query(
      `SELECT lr.id, lr.employee_id AS "employeeId", e.full_name AS "employeeName",
              lr.leave_type AS "leaveType", lr.start_date AS "startDate",
              lr.end_date AS "endDate", lr.reason, lr.status, lr.approved_by AS "approvedBy"
       FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id WHERE lr.id = $1`, [id]
    );
    return r.rows[0] as LeaveRequest;
  }

  async updateLeaveStatus(id: string, status: 'Approved' | 'Rejected', approvedBy: string): Promise<LeaveRequest> {
    await this.pool.query(
      'UPDATE leave_requests SET status = $1, approved_by = $2 WHERE id = $3',
      [status, approvedBy || 'Manager', id]
    );
    const r = await this.pool.query(
      `SELECT lr.id, lr.employee_id AS "employeeId", e.full_name AS "employeeName",
              lr.leave_type AS "leaveType", lr.start_date AS "startDate",
              lr.end_date AS "endDate", lr.reason, lr.status, lr.approved_by AS "approvedBy"
       FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id WHERE lr.id = $1`, [id]
    );
    return r.rows[0] as LeaveRequest;
  }

  // ── Attendance ──────────────────────────────────────────────────────────────

  async getAttendance(params?: { dateFrom?: string; dateTo?: string; employeeId?: string }): Promise<AttendanceRecord[]> {
    const conditions: string[] = [];
    const values: string[] = [];
    let idx = 1;
    if (params?.dateFrom) { conditions.push(`a.attendance_date >= $${idx++}`); values.push(params.dateFrom); }
    if (params?.dateTo) { conditions.push(`a.attendance_date <= $${idx++}`); values.push(params.dateTo); }
    if (params?.employeeId) { conditions.push(`a.employee_id = $${idx++}`); values.push(params.employeeId); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const r = await this.pool.query(
      `SELECT a.id, a.employee_id AS "employeeId", e.full_name AS "employeeName",
              a.attendance_date AS "attendanceDate", a.check_in AS "checkIn",
              a.check_out AS "checkOut", a.break_minutes AS "breakMinutes",
              a.working_hours::float AS "workingHours",
              a.overtime_hours::float AS "overtimeHours",
              a.late_minutes AS "lateMinutes",
              a.attendance_status AS "attendanceStatus", a.marked_by AS "markedBy",
              s.shift_name AS "shiftName", s.start_time AS "shiftStartTime",
              (EXTRACT(EPOCH FROM (s.end_time::time - s.start_time::time))/3600 - s.break_minutes/60.0) AS "shiftHours"
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       LEFT JOIN shifts s ON s.id = a.shift_id
       ${where}
       ORDER BY a.attendance_date DESC, e.full_name`,
      values
    );
    return r.rows as AttendanceRecord[];
  }

  async markAttendance(data: {
    employeeId: string; attendanceDate: string; checkIn: string;
    checkOut: string; breakMinutes: number;
    attendanceStatus: 'Present' | 'Absent' | 'Leave' | 'Half-Day';
    markedBy: string; shiftId?: string;
  }): Promise<AttendanceRecord> {
    const id = `att${Date.now()}`;

    // Get shift details for late/overtime calculation
    let shiftStartTime = '';
    let shiftDurationHours = 0;
    if (data.shiftId) {
      const shiftRes = await this.pool.query('SELECT start_time, end_time, break_minutes FROM shifts WHERE id = $1', [data.shiftId]);
      if (shiftRes.rows[0]) {
        shiftStartTime = shiftRes.rows[0].start_time;
        shiftDurationHours = shiftHours(shiftRes.rows[0].start_time, shiftRes.rows[0].end_time, shiftRes.rows[0].break_minutes);
      }
    }

    const wh = calcWorkingHours(data.checkIn, data.checkOut, data.breakMinutes);
    const ot = Math.max(0, wh - shiftDurationHours);
    const lateMin = data.checkIn ? calcLateMinutes(shiftStartTime, data.checkIn) : 0;

    // Upsert: replace existing record for same employee+date
    await this.pool.query(
      'DELETE FROM attendance WHERE employee_id = $1 AND attendance_date = $2',
      [data.employeeId, data.attendanceDate]
    );

    await this.pool.query(
      `INSERT INTO attendance (id, employee_id, attendance_date, check_in, check_out, break_minutes,
                               working_hours, overtime_hours, late_minutes, attendance_status, marked_by, shift_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, data.employeeId, data.attendanceDate, data.checkIn || '', data.checkOut || '',
       data.breakMinutes || 30, wh, ot, lateMin,
       data.attendanceStatus, data.markedBy || 'Manager', data.shiftId || '']
    );

    const r = await this.pool.query(
      `SELECT a.id, a.employee_id AS "employeeId", e.full_name AS "employeeName",
              a.attendance_date AS "attendanceDate", a.check_in AS "checkIn",
              a.check_out AS "checkOut", a.break_minutes AS "breakMinutes",
              a.working_hours::float AS "workingHours",
              a.overtime_hours::float AS "overtimeHours",
              a.late_minutes AS "lateMinutes",
              a.attendance_status AS "attendanceStatus", a.marked_by AS "markedBy",
              s.shift_name AS "shiftName", s.start_time AS "shiftStartTime"
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       LEFT JOIN shifts s ON s.id = a.shift_id
       WHERE a.id = $1`, [id]
    );
    return r.rows[0] as AttendanceRecord;
  }

  // ── Payroll ─────────────────────────────────────────────────────────────────

  async getPayrollSummaries(): Promise<PayrollSummary[]> {
    const r = await this.pool.query(
      `SELECT ps.id, ps.employee_id AS "employeeId", e.full_name AS "employeeName",
              ps.month, ps.working_days AS "workingDays",
              ps.working_hours::float AS "workingHours",
              ps.overtime_hours::float AS "overtimeHours",
              ps.leave_days AS "leaveDays", ps.generated_on AS "generatedOn"
       FROM payroll_summary ps
       JOIN employees e ON e.id = ps.employee_id
       ORDER BY ps.month DESC, e.full_name`
    );
    return r.rows as PayrollSummary[];
  }

  async generatePayroll(month: string): Promise<PayrollSummary[]> {
    // month format: 'YYYY-MM'
    const [year, mon] = month.split('-').map(Number);
    const dateFrom = `${month}-01`;
    // Last day of month
    const lastDay = new Date(year, mon, 0).getDate();
    const dateTo = `${month}-${String(lastDay).padStart(2, '0')}`;

    const employees = await this.getEmployees();
    const results: PayrollSummary[] = [];
    const generatedOn = new Date().toISOString().split('T')[0];

    for (const emp of employees) {
      // Attendance for this month
      const attRes = await this.pool.query(
        `SELECT COUNT(*) FILTER (WHERE attendance_status = 'Present' OR attendance_status = 'Half-Day')::int AS working_days,
                COALESCE(SUM(working_hours), 0)::float AS working_hours,
                COALESCE(SUM(overtime_hours), 0)::float AS overtime_hours
         FROM attendance
         WHERE employee_id = $1 AND attendance_date BETWEEN $2 AND $3`,
        [emp.id, dateFrom, dateTo]
      );
      const att = attRes.rows[0];

      // Approved leave days for this month
      const leaveRes = await this.pool.query(
        `SELECT COALESCE(SUM(
           LEAST(end_date::date, $3::date) - GREATEST(start_date::date, $2::date) + 1
         ), 0)::int AS leave_days
         FROM leave_requests
         WHERE employee_id = $1 AND status = 'Approved'
           AND start_date <= $3 AND end_date >= $2`,
        [emp.id, dateFrom, dateTo]
      );
      const leaveDays = leaveRes.rows[0]?.leave_days ?? 0;

      const id = `pay${Date.now()}-${emp.id}`;

      // Upsert: remove old payroll for same employee+month
      await this.pool.query(
        'DELETE FROM payroll_summary WHERE employee_id = $1 AND month = $2',
        [emp.id, month]
      );

      await this.pool.query(
        `INSERT INTO payroll_summary (id, employee_id, month, working_days, working_hours, overtime_hours, leave_days, generated_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, emp.id, month, att.working_days ?? 0, att.working_hours ?? 0, att.overtime_hours ?? 0, leaveDays, generatedOn]
      );

      results.push({
        id,
        employeeId: emp.id,
        employeeName: emp.fullName,
        month,
        workingDays: att.working_days ?? 0,
        workingHours: att.working_hours ?? 0,
        overtimeHours: att.overtime_hours ?? 0,
        leaveDays,
        generatedOn,
      });
    }

    return results;
  }

  // ── Analytics ───────────────────────────────────────────────────────────────

  async getStaffAnalytics() {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().split('T')[0];

    const [totalEmp, activeEmp, todayAtt, pendingLeave, avgHours, topLate] = await Promise.all([
      this.pool.query('SELECT COUNT(*)::int AS count FROM employees'),
      this.pool.query(`SELECT COUNT(*)::int AS count FROM employees WHERE status = 'Active'`),
      this.pool.query(
        `SELECT COUNT(*) FILTER (WHERE attendance_status = 'Present')::int AS present,
                COUNT(*) FILTER (WHERE attendance_status = 'Absent')::int AS absent,
                COUNT(*) FILTER (WHERE attendance_status = 'Leave')::int AS on_leave
         FROM attendance WHERE attendance_date = $1`, [today]
      ),
      this.pool.query(`SELECT COUNT(*)::int AS count FROM leave_requests WHERE status = 'Pending'`),
      this.pool.query(
        `SELECT COALESCE(AVG(working_hours), 0)::float AS avg FROM attendance
         WHERE attendance_date >= $1 AND attendance_status = 'Present'`, [monthStartStr]
      ),
      this.pool.query(
        `SELECT e.full_name AS name, COALESCE(SUM(a.late_minutes), 0)::int AS total_late
         FROM attendance a JOIN employees e ON e.id = a.employee_id
         WHERE a.attendance_date >= $1 AND a.late_minutes > 0
         GROUP BY e.full_name ORDER BY total_late DESC LIMIT 5`, [monthStartStr]
      ),
    ]);

    return {
      totalEmployees: totalEmp.rows[0]?.count ?? 0,
      activeEmployees: activeEmp.rows[0]?.count ?? 0,
      todayAttendance: todayAtt.rows[0] ?? { present: 0, absent: 0, on_leave: 0 },
      pendingLeaveRequests: pendingLeave.rows[0]?.count ?? 0,
      avgWorkingHoursThisMonth: Number((avgHours.rows[0]?.avg ?? 0).toFixed(2)),
      topLateArrivals: topLate.rows,
    };
  }
}
