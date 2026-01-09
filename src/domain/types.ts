export type WorkRecord = {
  date: string;        // "2025-12-19"
  checkIn?: string;    // "09:30"
  checkOut?: string;   // "18:10"
  breakMin?: number;   // 60
  employeeId?: string; // "admin" or staff id
  note?: string | null;
};
