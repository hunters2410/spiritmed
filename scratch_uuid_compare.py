import uuid

BASE_UUID = uuid.uuid5(uuid.NAMESPACE_DNS, "urocare.co.zw")

print("Report UUID for letter ID 444:", uuid.uuid5(BASE_UUID, "medical_report_old_id:444"))
print("Patient UUID for old patient ID 3054:", uuid.uuid5(BASE_UUID, "patient_old_id:3054"))
