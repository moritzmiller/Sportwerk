from flask import Flask, render_template, request
from openai import OpenAI
client = OpenAI()

app = Flask(__name__)

@app.route("/", methods=["GET", "POST"])
def home():
    output = ""  # <-- wichtig!

    if request.method == "POST":
        user_input = request.form["input"]
        response = client.responses.create(
            model="gpt-5.4",
            input=user_input,
        )

        output = response.output_text

    return render_template("hello.html", output=output)


app.run(debug=True)