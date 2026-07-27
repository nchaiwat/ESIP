# ESIP Local PWA — คู่มือทดลอง

อัปเดต: 2026-07-24

## เปิดและปิดระบบ

1. เปิด Docker Desktop ให้ทำงาน
2. ดับเบิลคลิก `Start_ESIP_Local.cmd`
3. เข้า `http://localhost:3000`
4. เมื่อเลิกใช้ ให้ดับเบิลคลิก `Stop_ESIP_Local.cmd`

ข้อมูล Role, Confirmation และ Audit จะไม่หายเมื่อปิด Container

## Role

### Administrator

- ดูข้อมูลหน้าบ้านทั้งหมด
- เข้า Admin Confirm และ Audit Log
- Confirm แล้ว Apply ทันที
- เข้า Settings และกำหนด Role ตามอีเมล

### Sale Admin

- ดูข้อมูล Sale ทั้งหมด
- เข้า Admin Confirm และ Audit Log
- Confirm แล้ว Apply ทันที
- ไม่เห็นและไม่สามารถเรียก Settings

### User

- ดู Dashboard และข้อมูล Frontend
- ไม่เห็น Admin Confirm, Audit Log และ Settings
- ฝั่งระบบปฏิเสธการ Confirm แม้เรียก API โดยตรง

## การทดลอง Role

บน Localhost มีช่อง `ทดลอง Role` ด้านขวาบน สามารถสลับทั้งสาม Role เพื่อตรวจหน้าบ้านและหลังบ้านได้
ช่องนี้มีไว้สำหรับการทดลองในเครื่องเท่านั้น

## Confirm & Apply

- คิว Product Mapping แสดง 33 รายการย่อย
- คิว Branch Mapping แสดง 677 รายการย่อย
- สามารถกรอง Product/Branch และค้นหาด้วย MT, SKU, Branch หรือ Candidate
- ต้องกรอก Approval Reference
- ระบบตรวจรายการกับ Governed Queue ล่าสุดก่อน
- เมื่อผ่าน จะสำรองข้อมูลและ Apply ผ่าน ESIP workflow เดิม
- จากนั้นจึงเปลี่ยนสถานะ PWA เป็น Approved/Applied และบันทึก Audit
- ถ้า Apply ไม่สำเร็จ รายการยังคงเป็น Pending
- รายการสรุปรวมจะยัง Apply ไม่ได้จนกว่าจะเปิดเป็นรายการย่อยที่ระบุต้นทางและ Candidate ชัดเจน

## รายงานและ Theme

- ใช้ปุ่ม `Light` / `Dark` ด้านขวาบนเพื่อเปลี่ยน Theme
- เมนู `รายงาน Sale Out` แสดง MT Comparison, Top Branch, Top SKU และ Stock on Hand
- เมนู `แหล่งข้อมูล` แสดงวันแรก วันล่าสุด และจำนวนวันที่มีข้อมูลของแต่ละ MT
- ข้อมูลที่โหลดอยู่ในปัจจุบันครอบคลุม 2026-07-11 ถึง 2026-07-22 รวม 12 วัน
- YoY 2025 vs 2026 ยังต้องมี Daily Raw ปี 2025
- GP/Margin ต้องมี Cost/COGS
- Target/Forecast/Achievement ต้องมี Target และ Forecast inputs
- DH และ HH มี QTY แต่ Sales Amount ปัจจุบันเป็นศูนย์ ระบบจะแสดง Data Quality Note
