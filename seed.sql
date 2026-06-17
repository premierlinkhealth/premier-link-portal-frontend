INSERT INTO users (email, full_name, role) VALUES
 ('jane@premierlinkhealth.com','Jane Okafor, NP','nurse'),
 ('maria@premierlinkhealth.com','Maria Santos, NP','nurse'),
 ('grace@premierlinkhealth.com','Grace Lee, NP','nurse'),
 ('dr.patel@premierlinkhealth.com','Dr. Anil Patel','doctor')
ON CONFLICT (email) DO UPDATE SET role=EXCLUDED.role, full_name=EXCLUDED.full_name, status='active';
DO $$
DECLARE admin_id uuid; nurses uuid[]; doc_id uuid; pid uuid; nid uuid; aid uuid; i int; dob date; st text;
 pnames text[] := ARRAY['Robert Alvarez','Margaret Chen','James Okoro','Linda Park','Harold Nguyen','Dorothy Ramirez','Frank Mueller','Gloria Adeyemi','Walter Kim','Betty Johansson','Eugene Brooks','Rosa Delgado','Albert Tanaka','Mildred Owens','Clyde Watson','Eleanor Sato','Raymond Cole','Josephine Marek','Stanley Wu','Irene Castillo'];
 conds text[] := ARRAY['Diabetes','Hypertension','COPD','CHF','CKD','Depression','Atrial fibrillation'];
BEGIN
 SELECT id INTO admin_id FROM users WHERE role='admin' LIMIT 1;
 SELECT array_agg(id) INTO nurses FROM users WHERE role='nurse';
 SELECT id INTO doc_id FROM users WHERE role='doctor' LIMIT 1;
 FOR i IN 1..array_length(pnames,1) LOOP
  nid := nurses[1 + (i % array_length(nurses,1))];
  dob := date '1940-01-01' + (random()*9000)::int;
  INSERT INTO patients (full_name,date_of_birth,insurance_id,hcc_history,created_by)
   VALUES (pnames[i],dob,'MBI'||lpad((1000+i)::text,6,'0'),to_jsonb(ARRAY(SELECT c FROM unnest(conds) c WHERE random()<0.4)),admin_id) RETURNING id INTO pid;
  INSERT INTO appointments (patient_id,nurse_id,scheduled_at,location,visit_type,status,created_by)
   VALUES (pid,nid,now()-((random()*30)::int||' days')::interval,'In-home',(ARRAY['AWV','Telehealth'])[1+(i%2)],(ARRAY['scheduled','completed','completed','no_show'])[1+(i%4)]::appt_status,admin_id) RETURNING id INTO aid;
  IF i % 5 <> 0 THEN
   st := (ARRAY['draft','submitted','submitted','approved','approved','returned'])[1+(i%6)];
   INSERT INTO assessments (patient_id,nurse_id,appointment_id,form_data,status,reviewed_by,reviewed_at,doctor_notes,signed_at)
    VALUES (pid,nid,aid,jsonb_build_object('visit_type','In-home','bp',(110+(i%30))||'/'||(70+(i%15)),'pulse',60+(i%25),'weight_lbs',140+(i*3%80),'conditions',to_jsonb(ARRAY(SELECT c FROM unnest(conds) c WHERE random()<0.5)),'fall_risk',(ARRAY['Low','Moderate','High'])[1+(i%3)],'follow_up','Routine 12-month follow-up'),st::hra_status,CASE WHEN st IN ('approved','returned') THEN doc_id END,CASE WHEN st IN ('approved','returned') THEN now()-((random()*10)::int||' days')::interval END,CASE WHEN st='returned' THEN 'Please confirm the medication list and re-check BP.' END,CASE WHEN st='approved' THEN now()-((random()*10)::int||' days')::interval END);
  END IF;
 END LOOP;
END $$;
SELECT (SELECT count(*) FROM users WHERE role IN ('nurse','doctor')) staff,(SELECT count(*) FROM patients) patients,(SELECT count(*) FROM appointments) appts,(SELECT count(*) FROM assessments) hras;
