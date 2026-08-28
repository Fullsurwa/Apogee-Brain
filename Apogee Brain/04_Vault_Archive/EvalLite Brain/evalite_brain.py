# EvalLite Brain - Starter Script
# Lightweight ROI + Impact Score calculator

# Example input data (replace with NGO/SME dataset)
outreach_reach = 1000        # number of people engaged
cost = 5000                  # total campaign spend
actions = 120                # number of people who took action
retained = 80                # number of people retained

# Core calculations
cost_per_beneficiary = cost / outreach_reach
conversion_rate = actions / outreach_reach
retention_rate = retained / actions

roi = actions / cost
predictive_social_impact_score = (conversion_rate * retention_rate) / cost_per_beneficiary

# Print results
print("Cost per Beneficiary:", round(cost_per_beneficiary, 2))
print("Conversion Rate:", round(conversion_rate, 2))
print("Retention Rate:", round(retention_rate, 2))
print("ROI:", round(roi, 2))
print("Predictive Social Impact Score:", round(predictive_social_impact_score, 4))
