-- G21 : modes de règlement supplémentaires (legacy: carte bancaire TPE, versement bancaire).
INSERT INTO "payment_methods" ("code","label","sort_order") VALUES
 ('CARTE_BANCAIRE','Carte bancaire (TPE)',5),('VERSEMENT','Versement',6)
ON CONFLICT ("code") DO NOTHING;
